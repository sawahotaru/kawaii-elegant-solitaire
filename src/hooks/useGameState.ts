import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, Card, Difficulty, Suit, Rank } from '../types/game';
import {
    initializeGame,
    canMoveToTableau,
    canMoveToFoundation,
    deepCopyState,
    getScoreMultiplier,
    findValidMoves,
    checkWin,
    defaultHints
} from '../utils/gameLogic';
import { solveBoards } from '../utils/solver';

export const useGameState = (initialDifficulty: Difficulty = 'normal', initialHintLimit: number | null = null) => {
    // ユーザー設定のヒント上限（null=難易度準拠）。新規ゲーム/難易度変更でも引き継ぐ。
    const hintLimitRef = useRef<number | null>(initialHintLimit);
    const [state, setState] = useState<GameState>(() => ({
        ...(initializeGame(initialDifficulty, initialHintLimit) as GameState),
        difficulty: initialDifficulty,
        undoStack: [],
        score: 0,
        time: 0,
        gameStatus: 'playing',
        hint: null,
    }));

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // 最新stateの参照（オートコンプリート起動時に同期的に読むため）
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    // オートコンプリート中の再生タイマー
    const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const stopAuto = () => { if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; } };
    useEffect(() => () => stopAuto(), []);

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
        stopAuto();
        const diff = difficulty || state.difficulty;
        setState({
            ...(initializeGame(diff, hintLimitRef.current) as GameState),
            difficulty: diff,
            undoStack: [],
            score: 0,
            time: 0,
            gameStatus: 'playing',
            hint: null,
        });
    }, [state.difficulty]);

    // ヒント上限の設定変更。現在のゲームの残数も即座に反映（refill）し、以降のゲームにも適用。
    const setHintLimit = useCallback((limit: number | null) => {
        hintLimitRef.current = limit;
        setState(prev => ({ ...prev, hintsRemaining: limit ?? defaultHints(prev.difficulty) }));
    }, []);

    // 【初心者限定・ズル】盤面の表向きカード(sourceId)と、欲しいカード(targetSuit/Rank)を入れ替える。
    // 重複が出ないよう2枚の正体(suit/rank/id)を交換し、各スロットの表裏は維持。
    // 組札(foundation)のカードは対象外＝完成列を壊さない。
    const swapCards = useCallback((sourceId: string, targetSuit: Suit, targetRank: Rank) => {
        setState(prev => {
            if (prev.difficulty !== 'beginner' || prev.gameStatus !== 'playing') return prev;

            const nextTableau = prev.tableau.map(p => p.map(c => ({ ...c })));
            const nextWaste = prev.waste.map(c => ({ ...c }));
            const nextStock = prev.stock.map(c => ({ ...c }));
            // foundation を除く全カード（swap 対象）
            const pool: Card[] = [...nextTableau.flat(), ...nextWaste, ...nextStock];

            const src = pool.find(c => c.id === sourceId);
            const tgt = pool.find(c => c.suit === targetSuit && c.rank === targetRank);
            if (!src || !tgt || src === tgt) return prev; // 対象が組札 等で見つからない/同一なら何もしない

            const tmp = { suit: src.suit, rank: src.rank, id: src.id };
            src.suit = tgt.suit; src.rank = tgt.rank; src.id = tgt.id;
            tgt.suit = tmp.suit; tgt.rank = tmp.rank; tgt.id = tmp.id;

            return {
                ...prev,
                tableau: nextTableau,
                waste: nextWaste,
                stock: nextStock,
                undoStack: pushToUndo(prev),
                hint: null,
            };
        });
    }, []);

    // オートコンプリート（一括あがり）: 全札が表向きなら勝ち筋を求めて自動再生する。
    const autoComplete = useCallback(() => {
        const prev = stateRef.current;
        if (prev.gameStatus !== 'playing' || autoRef.current) return;
        // 伏せ札が残っていたら実行しない
        if (prev.tableau.some(pile => pile.some(c => !c.isFaceUp))) return;
        const boards = solveBoards(prev.tableau, prev.stock, prev.waste, prev.foundation);
        if (!boards || boards.length < 2) return; // 解けない/既に詰み盤面

        let i = 1;
        autoRef.current = setInterval(() => {
            setState(p => {
                const b = boards[i];
                const won = i === boards.length - 1;
                i++;
                if (i >= boards.length) stopAuto();
                return {
                    ...p,
                    tableau: b.tableau,
                    stock: b.stock,
                    waste: b.waste,
                    foundation: b.foundation,
                    moves: p.moves + 1,
                    hint: null,
                    gameStatus: won ? 'won' : 'playing',
                    isGameWon: won,
                };
            });
        }, 90);
    }, []);

    return {
        state,
        drawCards,
        moveCards,
        undo,
        showHint,
        restart,
        autoComplete,
        setHintLimit,
        swapCards,
    };
};
