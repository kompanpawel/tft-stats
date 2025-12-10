import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {LeaderboardComponent} from '../leaderboard/leaderboard';

@Component({
  selector: 'app-root',
  imports: [LeaderboardComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  protected readonly title = signal('TFTStats');
}
