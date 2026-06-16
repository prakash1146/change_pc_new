import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AiChatService {
  readonly isOpen = signal(false);
  readonly input = signal('');

  open() { this.isOpen.set(true); }
  close() { this.isOpen.set(false); }
  toggle() { this.isOpen.update((v) => !v); }

  setInput(v: string) { this.input.set(v); }

  /** Open the chat panel with a pre-filled prompt. */
  openWithPrompt(text: string) {
    this.input.set(text);
    this.isOpen.set(true);
  }
}
