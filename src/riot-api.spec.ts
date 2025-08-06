import { TestBed } from '@angular/core/testing';

import { RiotApi } from './riot-api';

describe('RiotApi', () => {
  let service: RiotApi;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RiotApi);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
