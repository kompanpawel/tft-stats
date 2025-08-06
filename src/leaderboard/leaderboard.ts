import {Component, OnDestroy, OnInit} from '@angular/core';
import {PlayerRank, RiotApiService} from '../riot-api';
import {interval, startWith, Subscription} from 'rxjs';
import {DecimalPipe, NgClass, NgForOf, NgIf, TitleCasePipe} from '@angular/common';

@Component({
  selector: 'app-leaderboard',
  imports: [
    TitleCasePipe,
    NgClass,
    NgIf,
    NgForOf,
    DecimalPipe
  ],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.css'
})
export class LeaderboardComponent implements OnInit, OnDestroy {

  public players: PlayerRank[] = [];
  public loading: boolean = true;
  public lastUpdated: string = '';
  public showApiKeyWarning: boolean = false;

  private updateSubscription!: Subscription;
  private readonly updateInterval = 360000; // 1 godzina w milisekundach

  private readonly rankColors: any = {
    'IRON': 'text-gray-400', 'BRONZE': 'text-orange-400', 'SILVER': 'text-gray-300',
    'GOLD': 'text-yellow-400', 'PLATINUM': 'text-teal-400', 'EMERALD': 'text-green-400',
    'DIAMOND': 'text-blue-400', 'MASTER': 'text-purple-400', 'GRANDMASTER': 'text-red-500',
    'CHALLENGER': 'text-amber-300', 'UNRANKED': 'text-gray-500'
  };
  private readonly tierValues: any = { 'UNRANKED': 0, 'IRON': 1, 'BRONZE': 2, 'SILVER': 3, 'GOLD': 4, 'PLATINUM': 5, 'EMERALD': 6, 'DIAMOND': 7, 'MASTER': 8, 'GRANDMASTER': 9, 'CHALLENGER': 10 };

  constructor(private riotApiService: RiotApiService) { }

  ngOnInit(): void {
    // Uruchamia pobieranie danych natychmiast, a następnie co interwał
    this.updateSubscription = interval(this.updateInterval)
      .pipe(startWith(0))
      .subscribe(() => this.fetchRanks());
  }

  ngOnDestroy(): void {
    // Ważne: usuń subskrypcję, aby zapobiec wyciekom pamięci
    if (this.updateSubscription) {
      this.updateSubscription.unsubscribe();
    }
  }

  public fetchRanks(): void {
    this.loading = true;
    this.riotApiService.getPlayerRanks().subscribe({
      next: (data) => {
        this.players = data;
        this.loading = false;
        this.lastUpdated = new Date().toLocaleString();
        this.showApiKeyWarning = data.some(p => p.error && p.message === 'API Key is missing.');
      },
      error: (err) => {
        console.error('Failed to fetch leaderboard data:', err);
        this.loading = false;
      }
    });
  }

  public getTierIcon(tier: string | undefined): string {
    const safeTier = (tier || 'UNRANKED').toUpperCase();
    if (safeTier === 'UNRANKED') {
      return 'https://placehold.co/64x64/374151/9CA3AF?text=N/A';
    }
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/${safeTier.toLowerCase()}.png`;
  }

  public getTierColorClass(tier: string | undefined): string {
    const safeTier = (tier || 'UNRANKED').toUpperCase();
    return this.rankColors[safeTier] || 'text-gray-500';
  }

  public getDisplayRank(player: PlayerRank): string {
    const tier = (player.tier || '').toUpperCase();
    if (tier === 'UNRANKED' || this.tierValues[tier] >= this.tierValues['MASTER']) {
      return '';
    }
    return player.rank || '';
  }
}
