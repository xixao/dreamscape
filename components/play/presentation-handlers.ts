import { CoreEventHandlers } from '@craftjs/core';

/** Read-only connectors register geometry only. No selection, dragging, dropping
 * or creation handlers are installed. Craft normally disables DOM registration
 * together with editing, so keep these geometry-only connectors available. */
export class PresentationHandlers extends CoreEventHandlers {
  disable() {
    // Read-only is enforced by this handler set; there are no edit events to disable.
  }

  handlers() {
    return {
      ...super.handlers(),
      connect: (element: HTMLElement, id: string) => {
        this.options.store.actions.setDOM(id, element);
      },
    };
  }
}
