function requireFunction(value, name) {
  if (typeof value !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

/**
 * Thin Deck Editor seam for new-base hidden-hand registration.
 *
 * This module intentionally does not know the hidden-hand schema, deck-count
 * relationship, legality, persistence, replacement policy, ability, usage,
 * activation, reveal, or runtime semantics. Those remain owned by the
 * injected registration port and its downstream authority.
 */
export function createHiddenHandDeckEditorBridge(options = {}) {
  const getSelectedCardRef = requireFunction(options.getSelectedCardRef, 'getSelectedCardRef');
  const registrationPort = requireFunction(options.registrationPort, 'registrationPort');

  return Object.freeze({
    currentSelection() {
      return getSelectedCardRef();
    },

    requestRegistration() {
      const selectedCardRef = getSelectedCardRef();
      if (selectedCardRef === null || selectedCardRef === undefined) {
        throw new Error('hidden-hand Deck Editor registration requires a selected card reference');
      }
      return registrationPort(selectedCardRef);
    },
  });
}
