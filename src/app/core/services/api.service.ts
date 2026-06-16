import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { shareReplay, switchMap } from 'rxjs/operators';

/**
 * Central data-access service. Every feature component pulls its content data
 * through this service instead of hard-coding it.
 *
 * Each method fetches a static JSON file from the Angular assets folder
 * (`src/assets/json/data/<name>.json`). No backend server is required.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private assets$?: Observable<unknown>;

  private get<T>(path: string): Observable<T> {
    return this.http.get<T>(`assets/jsons/data/${path}.json`);
  }

  getDashboard<T>(): Observable<T> {
    return this.get<T>('dashboard');
  }

  getPerformance<T>(): Observable<T> {
    return this.get<T>('performance');
  }

  getPrompts<T>(): Observable<T> {
    return this.get<T>('prompts');
  }

  getAnalysis<T>(): Observable<T> {
    return this.get<T>('analysis');
  }

  getAssets<T>(): Observable<T> {
    this.assets$ ??= this.get<unknown>('assets').pipe(
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.assets$ as Observable<T>;
  }

  getFeedback<T>(): Observable<T> {
    return this.get<T>('feedback');
  }

  getCollectionDetail<T>(): Observable<T> {
    return this.get<T>('collection-detail');
  }

  getAgentDetail<T>(): Observable<T> {
    return this.get<T>('agent-detail');
  }

  getUsers<T>(): Observable<T> {
    return this.get<T>('users');
  }
}
