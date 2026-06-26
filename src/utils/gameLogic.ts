import { Card, Suit, Rank, GameState, Difficulty, GameStateSnapshot } from '../types/game';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const createDeck = (): Card[] => {
    const deck: Card[] = [];
    SUITS.forEach((suit) => {
        RANKS.forEach((rank) => {
            deck.push({
                id: `${suit}-${rank}`,
                suit,
                rank,
                isFaceUp: false,
            });
        });
    });
    return deck;
};

export const shuffle = (deck: Card[]): Card[] => {
    const newDeck = [...deck];
    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
};

export const isColorRed = (suit: Suit): boolean => suit === 'hearts' || suit === 'diamonds';

/**
 * 場札(Tableau)への移動判定
 * - 赤と黒が交互
 * - 数字が1つ小さい
 */
export const canMoveToTableau = (card: Card, targetCard: Card | undefined): boolean => {
    if (!targetCard) {
        return card.rank === 13; // 空の場札にはKのみ
    }
    const differentColor = isColorRed(card.suit) !== isColorRed(targetCard.suit);
    const correctRank = card.rank === targetCard.rank - 1;
    return differentColor && correctRank;
};

/**
 * 組札(Foundation)への移動判定
 * - 同じスート
 * - 数字が1つ大きい（A=1から開始）
 */
export const canMoveToFoundation = (card: Card, foundationPile: Card[]): boolean => {
    if (foundationPile.length === 0) {
        return card.rank === 1; // Aのみ
    }
    const topCard = foundationPile[foundationPile.length - 1];
    return card.suit === topCard.suit && card.rank === topCard.rank + 1;
};

export const initializeGame = (difficulty: Difficulty): Partial<GameState> => {
    const fullDeck = shuffle(createDeck());
    const tableau: Card[][] = Array.from({ length: 7 }, () => []);

    let deckIndex = 0;
    for (let i = 0; i < 7; i++) {
        for (let j = i; j < 7; j++) {
            const card = fullDeck[deckIndex++];
            if (j === i) card.isFaceUp = true;
            tableau[j].push(card);
        }
    }

    return {
        stock: fullDeck.slice(deckIndex),
        waste: [],
        foundation: [[], [], [], []],
        tableau: tableau,
        moves: 0,
        score: 0,
        time: 0,
        difficulty,
        isGameWon: false,
        gameStatus: 'playing',
        hint: null,
        hintsRemaining: difficulty === 'expert' ? 1 : difficulty === 'normal' ? 3 : 999,
    };
};

export const checkWin = (foundation: Card[][]): boolean => {
    return foundation.every(pile => pile.length === 13);
};

export const getScoreMultiplier = (difficulty: Difficulty): number => {
    switch (difficulty) {
        case 'beginner': return 1.0;
        case 'normal': return 1.5;
        case 'expert': return 2.5;
        default: return 1.0;
    }
};

export const deepCopyState = (state: GameState): GameStateSnapshot => {
    return {
        stock: state.stock.map(c => ({ ...c })),
        waste: state.waste.map(c => ({ ...c })),
        foundation: state.foundation.map(pile => pile.map(c => ({ ...c }))),
        tableau: state.tableau.map(pile => pile.map(c => ({ ...c }))),
        moves: state.moves,
        score: state.score,
    };
};

export const findValidMoves = (state: GameState) => {
    const moves: { from: string; to: string }[] = [];

    // 組札へ動かせるのは「各山の一番上のカード」のみ（埋もれたカードは単独で動かせない）
    const foundationCandidates: { card: Card; from: { type: string; index?: number } }[] = [];
    // 場札へは連番スタックの先頭になれるため、表向きカードすべてが候補になる
    const tableauCandidates: { card: Card; from: { type: string; index?: number } }[] = [];

    state.tableau.forEach((pile, i) => {
        if (pile.length === 0) return;

        const topCard = pile[pile.length - 1];
        if (topCard.isFaceUp) {
            foundationCandidates.push({ card: topCard, from: { type: 'tableau', index: i } });
        }

        pile.forEach((card) => {
            if (card.isFaceUp) {
                tableauCandidates.push({ card, from: { type: 'tableau', index: i } });
            }
        });
    });

    if (state.waste.length > 0) {
        const wasteTop = state.waste[state.waste.length - 1];
        foundationCandidates.push({ card: wasteTop, from: { type: 'waste' } });
        tableauCandidates.push({ card: wasteTop, from: { type: 'waste' } });
    }

    // 1. 組札へ（一番上のカードのみ）
    foundationCandidates.forEach(({ card }) => {
        state.foundation.forEach((pile, i) => {
            if (canMoveToFoundation(card, pile)) {
                moves.push({ from: card.id, to: `foundation-${i}` });
            }
        });
    });

    // 2. 他の場札へ（連番スタックの先頭になれる表向きカード）
    tableauCandidates.forEach(({ card, from }) => {
        state.tableau.forEach((pile, i) => {
            if (from.type === 'tableau' && from.index === i) return;
            if (canMoveToTableau(card, pile[pile.length - 1])) {
                moves.push({ from: card.id, to: `tableau-${i}` });
            }
        });
    });

    return moves;
};
