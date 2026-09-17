import { CoreEventHandlers } from '@craftjs/core';

/** Register real DOM boundaries without installing selection, drag or drop handlers. */
export class ReadOnlyEvents extends CoreEventHandlers {
  handlers() {
    return {
      ...super.handlers(),
      connect: (element: HTMLElement, id: string) => {
        this.options.store.actions.setDOM(id, element);
      },
    };
  }
}
