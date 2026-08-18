import { useReducer, useCallback } from 'react';

interface UndoState<T> {
  past: T[];
  present: T;
  future: T[];
}

type UndoAction<T> =
  | { type: 'PUSH'; value: T }
  | { type: 'UNDO' }
  | { type: 'REDO' };

function reduce<T>(state: UndoState<T>, action: UndoAction<T>): UndoState<T> {
  switch (action.type) {
    case 'PUSH':
      return { past: [...state.past, state.present], present: action.value, future: [] };
    case 'UNDO':
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      };
    case 'REDO':
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      };
  }
}

export function useUndoRedo<T>(initial: T) {
  const [state, dispatch] = useReducer(
    (s: UndoState<T>, a: UndoAction<T>) => reduce(s, a),
    { past: [], present: initial, future: [] },
  );
  const push = useCallback((value: T) => dispatch({ type: 'PUSH', value }), []);
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);
  return {
    value: state.present,
    push, undo, redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
