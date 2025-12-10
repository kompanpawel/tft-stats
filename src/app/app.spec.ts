import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { App } from './app';
import { RiotApiService } from '../riot-api';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: RiotApiService,
          useValue: { getPlayerRanks: () => of([]) }
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    // Root template should render the leaderboard component
    expect(compiled.querySelector('app-leaderboard')).toBeTruthy();
  });
});
