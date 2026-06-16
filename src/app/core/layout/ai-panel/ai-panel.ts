import { Component, inject, signal } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { AiChatService } from '../../../shared/services/ai-chat.service';

@Component({
  selector: 'wbct-ai-panel',
  imports: [TablerIconComponent],
  templateUrl: './ai-panel.html',
  styleUrl: './ai-panel.css',
})
export class AiPanel {
  // State lives in the shared service so any page can open the panel and so the
  // conversation survives navigation. The service streams replies from the
  // CopilotKit runtime (mock-server) via @ag-ui/client.
  private readonly chat = inject(AiChatService);
  readonly aiOpen = this.chat.isOpen;
  readonly aiInput = this.chat.input;
  readonly aiMessages = signal([]);// this.chat.messages;
  readonly aiBusy = signal(false);//this.chat.busy;

  readonly aiSuggestions: string[] = [
    'Which region is adoption picking up in?',
    "What's driving the negative feedback spike this period?",
    'Where are the biggest content gaps in K360?',
  ];

  useSuggestion(text: string) {
    this.chat.setInput(text);
  }

  sendMessage() {
    // void this.chat.sendMessage();
  }

  toggleAi() { this.chat.toggle(); }
  openAi()   { this.chat.open(); }
  closeAi()  { this.chat.close(); }
  setAiInput(value: string) { this.chat.setInput(value); }
}
