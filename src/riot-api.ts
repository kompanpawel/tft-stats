// src/app/services/riot-api.service.ts
import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {filter, forkJoin, from, mergeMap, Observable, of, switchMap, take, timer, toArray, zip} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {environment} from './environments/environment.development';

// Interfejsy danych dla lepszej organizacji i bezpieczeństwa
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
  positions?: string[];
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
    {name: 'kompanpawel#21137', puuid: '51VQ8c9vtv0KK2EZdhz1IO3QxhyOmm7qKR1PsatpepWJ04v0IXxXNRYrSr1m3--krno8LRgLG8dPVg'},
    {name: '1 team 5 pajaców#pajac', puuid: 'NCjhgesMYSv1rNIaaEcIDtPhvuk9vLIsmzyDZbx4s8ZydxTTCGR_pzQ5nCaPBl42iE6ggPHaJA8OWA'},
    {name: 'Krecik94#EUW', puuid: 'zo6_0xhaQOMBxJYlmVeOCwzzTGzn09L0GvxIEgasOvcHaxKGyrxkkpWpgFQoct2F_4F6usBE6ReZzQ'},
    {name: 'exisof#EUW', puuid: 'RQcd9yOloQQpLnG3UrRbgcu6fruPRIxl6b-YbTGZGRJ0uONvJQWRO1glpw_SXzMv2pft1-6Pfe8Uxw'},
  ];

  // Mapowanie rang dla obliczania wyniku
  private tierValues: any = { 'UNRANKED': 0, 'IRON': 1, 'BRONZE': 2, 'SILVER': 3, 'GOLD': 4, 'PLATINUM': 5, 'EMERALD': 6, 'DIAMOND': 7, 'MASTER': 8, 'GRANDMASTER': 9, 'CHALLENGER': 10 };
  private rankValues: any = { 'IV': 1, 'III': 2, 'II': 3, 'I': 4 };

  constructor(private http: HttpClient) { }

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
      mergeMap(matchIds => from(matchIds)),
      mergeMap(matchId => this.fetchPlayerPositionInMatch(matchId, player.puuid)),
      filter(details => details.position !== ''),
      toArray(),
      map((array) => {
        const sortedArray = array.sort((a, b) => b.date - a.date)
        let newArray: string[] = [];
        sortedArray.forEach((element) => {
          newArray.push(element.position)
        })
        return newArray
      })
    )
    const playerRankData$ = this.http.get<any[]>(leagueUrl).pipe(
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
      map(([positions, data]) => ({
        positions, ...data
      }))
    )
  }

  private fetchPlayerMatches (puuid: string): Observable<string[]> {
    const requestLimit = 3;
    const totalRequests = 4;

    return timer(0, 1000).pipe(
      take(totalRequests),
      switchMap(index => {
        const start = index * requestLimit;
        const url = `https://europe.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?start=${start}&count=${requestLimit}&api_key=${this.apiKey}`
        return this.http.get<any[]>(url);
      }
    ));
  }

  private fetchPlayerPositionInMatch(matchId: string, playerPuuid: string): Observable<{position: string, date: number}> {
    const url = `https://europe.api.riotgames.com/tft/match/v1/matches/${matchId}?api_key=${this.apiKey}`
    return this.http.get(url).pipe(
      map((matchData: any) => {
        const isMatchTypeStandard = matchData.info.tft_game_type === 'standard';
        if (isMatchTypeStandard) {
          const playerMatchData = matchData.info.participants.find((entry: any) => entry.puuid === playerPuuid);
          const matchDate = matchData.info.game_datetime;
          return {position: playerMatchData.placement, date: matchDate};
        } else return {position: '', date: ''};
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
