type Listener = (...args: any[]) => void;

class SimpleEventEmitter {
  private listeners: Map<string, Listener[]> = new Map();

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  off(event: string, listener: Listener) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index !== -1) eventListeners.splice(index, 1);
    }
  }

  emit(event: string, ...args: any[]) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      // Copy to avoid mutation during iteration
      [...eventListeners].forEach(listener => listener(...args));
    }
  }
}

const eventEmitter = new SimpleEventEmitter();
export default eventEmitter;