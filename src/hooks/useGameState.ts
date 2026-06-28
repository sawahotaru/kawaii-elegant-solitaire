import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, Card, Difficulty } from '../types/game';
import {
    initializeGame,
    canMoveToTableau,
    canMoveToFoundation,
    deepCopyState,
    getScoreMultiplier,
    findValidMoves,
    checkWin
} from '../utils/gameLogic';

export const useGameState = (initialDifficulty: Difficulty = 'normal') => {
    const [state, setState] = useState<GameState>(() => ({
        ...(initializeGame(initialDifficulty) as GameState),
        difficulty: initialDifficulty,
        undoStack: [],
        score: 0,
        time: 0,
        gameStatus: 'playing',
        hint: null,
    }));

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // タイマー開始
    useEffect(() => {
        if (state.gameStatus === 'playing') {
            timerRef.current = setInterval(() => {
                setState(prev => ({ ...prev, time: prev.time + 1 }));
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [state.gameStatus]);

    const pushToUndo = (s: GameState) => {
        const limit = s.difficulty === 'expert' ? 3 : s.difficulty === 'normal' ? 100 : 999;
        const newStack = [deepCopyState(s), ...s.undoStack].slice(0, limit);
        return newStack;
    };

    const drawCards = useCallback(() => {
        setState((prev) => {
            if (prev.gameStatus !== 'playing') return prev;

            const nextUndo = pushToUndo(prev);

            // Deep clone existing cards for the new state
            const currentStock = prev.stock.map(c => ({ ...c }));
            const currentWaste = prev.waste.map(c => ({ ...c }));

            if (currentStock.length === 0) {
                // Recycle: flip the whole waste pile back to stock preserving the
                // original draw order. waste is [oldest..newest]; drawing reads from
                // the front, so the new stock must stay [oldest..newest] (NOT reversed)
                // — otherwise the just-seen top card is immediately re-dealt.
                return {
                    ...prev,
                    stock: currentWaste.map(c => ({ ...c, isFaceUp: false })),
                    waste: [],
                    undoStack: nextUndo,
                    moves: prev.moves + 1,
                    hint: null,
                };
            }
            const numToDraw = prev.difficulty === 'expert' ? 3 : 1;
            const drawn = currentStock.slice(0, numToDraw).map(c => ({ ...c, isFaceUp: true }));
            return {
                ...prev,
                stock: currentStock.slice(numToDraw),
                waste: [...currentWaste, ...drawn],
                undoStack: nextUndo,
                moves: prev.moves + 1,
                hint: null,
            };
        });
    }, []);

    const moveCards = useCallback((sourceType: string, sourceIndex: number | undefined, cardIds: string[], targetType: string, targetIndex: number) => {
        setState((prev) => {
            if (prev.gameStatus !== 'playing') return prev;

            // 1. 完全なディープコピーを作成（全てのカードオブジェクトを新しく生成）
            const nextTableau = prev.tableau.map(pile => pile.map(c => ({ ...c })));
            const nextFoundation = prev.foundation.map(pile => pile.map(c => ({ ...c })));
            const nextWaste = prev.waste.map(c => ({ ...c }));
            const undoStack = pushToUndo(prev);

            // 2. カードを移動元から取り出す
            let cardsToMove: Card[] = [];
            if (sourceType === 'tableau' && sourceIndex !== undefined) {
                const pile = nextTableau[sourceIndex];
                const index = pile.findIndex(c => c.id === cardIds[0]);
                if (index === -1) return prev;
                cardsToMove = pile.splice(index);

                // 移動した後の山のトップが伏せられていたら表にする
                if (pile.length > 0 && !pile[pile.length - 1].isFaceUp) {
                    pile[pile.length - 1].isFaceUp = true;
                }
            } else if (sourceType === 'waste') {
                if (nextWaste.length === 0) return prev;
                cardsToMove = [nextWaste.pop()!];
            } else if (sourceType === 'foundation' && sourceIndex !== undefined) {
                if (nextFoundation[sourceIndex].length === 0) return prev;
                cardsToMove = [nextFoundation[sourceIndex].pop()!];
            }

            // 3. 移動先へ配置
            let scoreAwarded = 0;
            if (targetType === 'tableau') {
                nextTableau[targetIndex].push(...cardsToMove);
                scoreAwarded = 5;
            } else if (targetType === 'foundation') {
                nextFoundation[targetIndex].push(...cardsToMove);
                scoreAwarded = 15;
            }

            const nextScore = prev.score + Math.floor(scoreAwarded * getScoreMultiplier(prev.difficulty));
            const isWon = checkWin(nextFoundation);

            return {
                ...prev,
                tableau: nextTableau,
                foundation: nextFoundation,
                waste: nextWaste,
                undoStack,
                score: nextScore,
                moves: prev.moves + 1,
                hint: null,
                gameStatus: isWon ? 'won' : 'playing',
                isGameWon: isWon,
            };
        });
    }, []);

    const undo = useCallback(() => {
        setState(prev => {
            if (prev.undoStack.length === 0) return prev;
            const [last, ...rest] = prev.undoStack;
            return {
                ...prev,
                ...last,
                undoStack: rest,
                hint: null,
            };
        });
    }, []);

    const showHint = useCallback(() => {
        setState(prev => {
            if (prev.hintsRemaining <= 0) return prev; // ヒント切れ

            const moves = findValidMoves(prev);
            if (moves.length === 0) return { ...prev, hint: null };

            return {
                ...prev,
                hint: moves[0],
                hintsRemaining: prev.hintsRemaining - 1
            };
        });
    }, []);

    const restart = useCallback((difficulty?: Difficulty) => {
        const diff = difficulty || state.difficulty;
        setState({
            ...(initializeGame(diff) as GameState),
            difficulty: diff,
            undoStack: [],
            score: 0,
            time: 0,
            gameStatus: 'playing',
            hint: null,
        });
    }, [state.difficulty]);

    return {
        state,
        drawCards,
        moveCards,
        undo,
        showHint,
        restart,
    };
};
