import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'wbct-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {}
