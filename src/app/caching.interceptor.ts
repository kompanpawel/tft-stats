import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of, tap } from 'rxjs';

const cache = new Map<string, { response: HttpResponse<any>, expiry: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const cachingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') {
    return next(req);
  }

  const cached = cache.get(req.urlWithParams);
  if (cached && cached.expiry > Date.now()) {
    return of(cached.response);
  }

  return next(req).pipe(
    tap(event => {
      if (event instanceof HttpResponse) {
        cache.set(req.urlWithParams, {
          response: event,
          expiry: Date.now() + CACHE_DURATION
        });
      }
    })
  );
};
