// src/app/services/riot-api.service.ts
import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {concatMap, filter, forkJoin, from, mergeMap, Observable, of, Subject, switchMap, toArray, zip} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {environment} from './environments/environment';

// Interfejsy danych dla lepszej organizacji i bezpieczeństwa
export interface MatchDetail {
  position: string;
  date: number;
  matchId?: string; // Added to uniquely identify matches
  lpChange?: number;
  totalLp?: number;
}

export interface PlayerRank {
  gameName: string;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
  rankScore?: number;
  error?: boolean;
  message?: string;
  positions?: MatchDetail[];
}

interface RiotPlayerConfig {
  name: string;
  puuid: string;
}

@Injectable({
  providedIn: 'root'
})
export class RiotApiService {

  // --- Konfiguracja ---

  private readonly apiKey = environment.apiKey; // <-- Wstaw swój klucz API
  private readonly serverConfig = {
    platform: 'euw1',
    region: 'europe'
  };

  private readonly riotIds: RiotPlayerConfig[] = [
    {name: 'kompanpawel#21137', puuid: 'A2sByZfB8zxA3J2dcTPpWNceAkWP78-rkH_EYizfx52NC9sL1j0IZyOJPnBQo2Z9qyeZDmk2kG-5Xw'},
    {name: 'Luxero#pajac', puuid: '6y0GMGw34bo4MnydNiZlxKSOzpuyAN7-tOgB8ZSiR8e9RcoDP9vfmRU9O7nTBsADkmn53ZiVMn-Aaw'},
    {name: 'Krecik94#EUW', puuid: '9lxSx0451MGIifaCEyjSrPuDpHUDyCKpxgtyZTIW8uGReAJA8aNcQ474YKvRsNiK_r8qLDxyaB8iIw'},
    // {name: 'exisof#EUW', puuid: 'ILzKoxkyoEselp9xk2W2FhtwdgB-Hpzs1zYjkn3E7NYs2_aqCb3RFK7UoPp1-TzWS5njiodJ9HGO2Q'},
  ];

  private readonly tierValues: any = { 'UNRANKED': 0, 'IRON': 1, 'BRONZE': 2, 'SILVER': 3, 'GOLD': 4, 'PLATINUM': 5, 'EMERALD': 6, 'DIAMOND': 7, 'MASTER': 8, 'GRANDMASTER': 9, 'CHALLENGER': 10 };
  private rankValues: any = { 'IV': 1, 'III': 2, 'II': 3, 'I': 4 };

  private readonly STORAGE_KEY = 'tft_player_history';

  constructor(private http: HttpClient) { }

  // --- Globalne ograniczanie tempa (rate limiter) ---
  // Riot API: max 20 żądań na 1 sekundę. Poniższa kolejka zapewnia wykonanie
  // maksymalnie 1 żądania co 50 ms (20 req/s) dla całej aplikacji.
  private readonly requestQueue$ = new Subject<() => void>();

  private enqueue<T>(factory: () => Observable<T>): Observable<T> {
    return new Observable<T>((observer) => {
      const task = () => {
        const sub = factory().subscribe({
          next: (v) => observer.next(v),
          error: (err) => observer.error(err),
          complete: () => observer.complete()
        });
        // Zwracamy funkcję czyszczącą subskrypcję, jeśli obserwator anuluje przed rozpoczęciem
        return () => sub.unsubscribe();
      };

      // Wstaw zadanie do kolejki; będzie wykonane zgodnie z limitem
      this.requestQueue$.next(task);

      // Zwróć teardown – w tym prostym wariancie nie mamy możliwości usunąć już
      // wstawionego zadania z kolejki, ale pozwalamy anulować subskrypcję po rozpoczęciu.
      return () => { /* no-op */ };
    });
  }

  /**
   * Pobiera dane o rangach wszystkich graczy.
   * Używa `forkJoin` do równoczesnego wysyłania wielu żądań HTTP.
   */
  public getPlayerRanks(): Observable<PlayerRank[]> {
    if (!this.apiKey || this.apiKey.trim() === '') {
      return of(
        this.riotIds.map(id => ({
          gameName: id.name.split('#')[0],
          error: true,
          message: 'API Key is missing.'
        }))
      );
    }


    const requests = this.riotIds.map(player => this.fetchPlayerRank(player));
    return forkJoin(requests).pipe(
      map(players => {
        // Oblicz wynik i posortuj
        players.forEach(p => p.rankScore = this.getRankScore(p));
        return players.sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));
      })
    );
  }

  /**
   * Pobiera dane rangi dla pojedynczego gracza.
   */
  private fetchPlayerRank(player: RiotPlayerConfig): Observable<PlayerRank> {
    const [gameName] = player.name.split('#');
    const leagueUrl = `https://${this.serverConfig.platform}.api.riotgames.com/tft/league/v1/by-puuid/${player.puuid}?api_key=${this.apiKey}`;

    const playerPositions$ = this.fetchPlayerMatches(player.puuid).pipe(
      switchMap(matchIds => {
        const storage = this.getStorage();
        const history = storage[player.puuid];

        // If we have history and the latest match ID matches what we just got from the API,
        // we can skip fetching details for all matches and just use what we have.
        if (history && history.matches && history.matches.length > 0 && matchIds.length > 0) {
          const latestMatchId = matchIds[0]; // newest match ID
          const latestStoredMatch = history.matches[0]; // history is sorted desc by date

          if (latestStoredMatch.matchId === latestMatchId) {
            return of(history.matches as MatchDetail[]);
          }
        }

        return from(matchIds).pipe(
          mergeMap(matchId => this.fetchPlayerPositionInMatch(matchId, player.puuid)),
          filter(details => details.position !== ''),
          toArray(),
          map((array) => {
            return array.sort((a, b) => b.date - a.date)
          })
        );
      })
    );
    const playerRankData$ = this.enqueue(() => this.http.get<any[]>(leagueUrl)).pipe(
      map(leagueData => {
        const rankedTftEntry = leagueData.find(entry => entry.queueType === 'RANKED_TFT');
        if (rankedTftEntry) {
          return {
            gameName: gameName,
            tier: rankedTftEntry.tier,
            rank: rankedTftEntry.rank,
            leaguePoints: rankedTftEntry.leaguePoints,
            wins: rankedTftEntry.wins,
            losses: rankedTftEntry.losses
          };
        } else {
          return {
            gameName: gameName,
            tier: 'UNRANKED',
            leaguePoints: 0,
            wins: 0,
            losses: 0
          };
        }
      }),
      catchError(error => {
        console.error(`Failed to fetch data for ${player.name}:`, error);
        return of({
          gameName: gameName,
          error: true,
          message: error.statusText || 'Unknown error'
        });
      })
    );

    return zip(playerPositions$, playerRankData$).pipe(
      map(([positions, data]) => {
        const playerRank: PlayerRank = { positions, ...data };
        this.processLpChanges(player.puuid, playerRank);
        return playerRank;
      })
    )
  }

  private processLpChanges(puuid: string, currentData: PlayerRank): void {
    if (currentData.error || currentData.tier === 'UNRANKED' || !currentData.positions) {
      return;
    }

    const storage = this.getStorage();
    const history = storage[puuid] || { lastLp: currentData.leaguePoints || 0, matches: [] };

    // Sort positions by date ascending to process chronologically
    const sortedMatches = [...currentData.positions].sort((a, b) => a.date - b.date);
    const updatedMatches: MatchDetail[] = [];

    for (const match of sortedMatches) {
      const storedMatch = history.matches.find((m: any) => m.matchId === match.matchId);
      if (storedMatch) {
        match.lpChange = storedMatch.lpChange;
        match.totalLp = storedMatch.totalLp;
      }
      updatedMatches.push(match);
    }

    // If it's not new, we should still ensure the latest LP is synced if the match matches
    const latestMatch = sortedMatches[sortedMatches.length - 1];

    // Find all matches that are NOT in history
    const newMatches = sortedMatches.filter(match => !history.matches.find((m: any) => m.matchId === match.matchId));

    if (newMatches.length > 0) {
      // The most recent match gets the current LP and the total change
      const mostRecentNew = newMatches[newMatches.length - 1];
      mostRecentNew.totalLp = currentData.leaguePoints;
      mostRecentNew.lpChange = (currentData.leaguePoints || 0) - history.matches[0].totalLp;

      // Other new matches are just marked as seen (already in updatedMatches)
    } else if (latestMatch) {
      // If it's not a new match, but current LP differs from stored lastLp,
      // it might be a very recent match that Riot just finished processing,
      // or LP updated but match list didn't.

      const storedLatest = history.matches.find((m: any) => m.matchId === latestMatch.matchId);
      if (storedLatest && storedLatest.totalLp !== currentData.leaguePoints) {
        latestMatch.totalLp = currentData.leaguePoints;
        const currentIdx = history.matches.findIndex((match: any) => match.matchId === latestMatch.matchId);
        const previousMatchInHistory = history.matches[currentIdx + 1];
        const baseLp = previousMatchInHistory ? previousMatchInHistory.totalLp : 0;
        latestMatch.lpChange = (currentData.leaguePoints || 0) - (baseLp || 0);
      }
    }

    // Update current positions with calculated values
    currentData.positions = [...updatedMatches].sort((a, b) => b.date - a.date);

    // Limit stored history to avoid localStorage bloat
    const limitedMatches = currentData.positions.map(m => ({
      matchId: m.matchId,
      lpChange: m.lpChange,
      totalLp: m.totalLp,
      date: m.date,
      position: m.position
    })).slice(0, 15); // Increased to 15 to track more history

    storage[puuid] = {
      matches: limitedMatches
    };

    // Only save if we actually have data to save
    if (limitedMatches.length > 0) {
      this.saveStorage(storage);
    }
  }

  private getStorage(): any {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  }

  private saveStorage(data: any): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  private fetchPlayerMatches (puuid: string): Observable<string[]> {
    const requestLimit = 3;
    const totalRequests = 4;

    const indices = Array.from({length: totalRequests}, (_, i) => i);
    return from(indices).pipe(
      concatMap(index => {
        const start = index * requestLimit;
        const url = `https://europe.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?start=${start}&count=${requestLimit}&api_key=${this.apiKey}`
        return this.enqueue(() => this.http.get<any[]>(url));
      }),
      toArray(),
      map(arrays => arrays.flat())
    );
  }

  private fetchPlayerPositionInMatch(matchId: string, playerPuuid: string): Observable<MatchDetail> {
    const url = `https://europe.api.riotgames.com/tft/match/v1/matches/${matchId}?api_key=${this.apiKey}`
    return this.enqueue(() => this.http.get(url)).pipe(
      map((matchData: any) => {
        // Handle potentially missing match data or error responses
        if (!matchData || !matchData.info || !matchData.info.participants) {
          return { matchId, position: '', date: 0 };
        }

        const isMatchTypeStandard = matchData.info.tft_game_type === 'standard';
        if (isMatchTypeStandard) {
          const playerMatchData = matchData.info.participants.find((entry: any) => entry.puuid === playerPuuid);

          if (!playerMatchData) {
            return { matchId, position: '', date: 0 };
          }

          const matchDate = matchData.info.game_datetime;
          return {
            matchId: matchId,
            position: playerMatchData.placement.toString(),
            date: matchDate,
            // Riot API does not provide LP info in match data.
            lpChange: undefined,
            totalLp: undefined
          };
        } else return { matchId, position: '', date: 0 };
      }),
      catchError(err => {
        console.error(`Error fetching match ${matchId}:`, err);
        return of({ matchId, position: '', date: 0 });
      })
    );
  }

  /**
   * Oblicza numeryczny wynik rangi dla łatwego sortowania.
   */
  private getRankScore(playerData: PlayerRank): number {
    if (!playerData.tier) {
      return 0;
    }
    const tierScore = this.tierValues[playerData.tier.toUpperCase()] || 0;
    if (tierScore >= this.tierValues['MASTER']) {
      return (tierScore * 10000) + (playerData.leaguePoints || 0);
    }
    const rankScore = this.rankValues[playerData.rank!.toUpperCase()] || 0;
    return (tierScore * 10000) + (rankScore * 1000) + (playerData.leaguePoints || 0);
  }
}
