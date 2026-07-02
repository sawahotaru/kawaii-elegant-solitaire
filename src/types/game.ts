export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13; // 1=A, 11=J, 12=Q, 13=K

export interface Card {
    id: string;
    suit: Suit;
    rank: Rank;
    isFaceUp: boolean;
}

export type Difficulty = 'beginner' | 'normal' | 'expert';

export interface GameState {
    stock: Card[];      // 山札 (未ドロー)
    waste: Card[];      // 山札 (ドロー済み)
    foundation: Card[][]; // 組札 (4つ)
    tableau: Card[][];    // 場札 (7列)
    moves: number;
    score: number;
    time: number;
    difficulty: Difficulty;
    undoStack: GameStateSnapshot[];
    isGameWon: boolean;
    gameStatus: 'playing' | 'won' | 'paused';
    hint: { from: string; to: string } | null;
    hintsRemaining: number;
}

export interface GameStateSnapshot {
    stock: Card[];
    waste: Card[];
    foundation: Card[][];
    tableau: Card[][];
    moves: number;
    score: number;
}
