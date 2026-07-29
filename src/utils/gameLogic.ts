import { Card, Suit, Rank, GameState, Difficulty, GameStateSnapshot } from '../types/game';
import { isSolvable } from './solver';
import { isForwardWinnable } from './forwardSolver';

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

/** 1組をシャッフルして Klondike の初期配置（場札7列＋山札）を作る。 */
const dealLayout = (): { tableau: Card[][]; stock: Card[] } => {
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
    return { tableau, stock: fullDeck.slice(deckIndex) };
};

/**
 * 高ランク寄せの重み付き抽選（rank^pow に比例）。pow=0 で通常のランダム。
 * pool から選んだ1枚を取り除いて返す（破壊的）。
 */
const pickWeightedHigh = (pool: Card[], pow: number): Card => {
    let total = 0;
    for (const c of pool) total += Math.pow(c.rank, pow);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
        r -= Math.pow(pool[i].rank, pow);
        if (r <= 0) return pool.splice(i, 1)[0];
    }
    return pool.pop() as Card;
};

// 初心者モードの高ランク寄せ強度。
// FACE: 場札7列の表向きカード（K/Q/J が並ぶと空列にKを置ける・重ねる先が多い）
// STOCK: 山札の並び（先頭＝先にめくられる側ほど高ランクになりやすい）
const BEGINNER_FACE_POW = 1.6;
const BEGINNER_STOCK_POW = 0.9;

/**
 * Klondike の初期配置を作る（高ランク寄せ版）。
 * 表向きになる7枚と山札の序盤に大きい数字が来やすくする。伏せ札はランダムのまま。
 */
const dealLayoutHighBiased = (facePow: number, stockPow: number): { tableau: Card[][]; stock: Card[] } => {
    const pool = shuffle(createDeck());
    const faceUp: Card[] = [];
    for (let i = 0; i < 7; i++) faceUp.push(pickWeightedHigh(pool, facePow));
    const faceDown = pool.splice(0, 21); // 伏せ札はバイアス無し（見えないので体感に効かない）
    const stock: Card[] = [];
    while (pool.length) stock.push(pickWeightedHigh(pool, stockPow)); // 先頭＝先にめくる側から抽選

    const tableau: Card[][] = Array.from({ length: 7 }, () => []);
    let d = 0;
    for (let col = 0; col < 7; col++) {
        for (let k = 0; k < col; k++) tableau[col].push(faceDown[d++]);
        const top = faceUp[col];
        top.isFaceUp = true;
        tableau[col].push(top);
    }
    return { tableau, stock };
};

// 中級(normal)の perfect-info 可解判定ノード予算。
const NORMAL_SOLVE_BUDGET = 12000;
const MAX_DEAL_ATTEMPTS = 120;

/**
 * 難易度に応じて配りを生成（試行上限つき）。
 * - beginner: 伏せ札を先読みしない“手なりプレイ”で解ける盤面のみ（＝ほぼ必勝の入門ティア）。
 *             perfect-info 可解だけでは人間視点の易しさに直結しないため forward 判定を使う。
 *             加えて配り自体を高ランク寄せにして「序盤から動かせる」体感を作る（離脱対策）。
 * - normal:   perfect-info ソルバーで「解ける手順が存在する」盤面のみ（要・計画的プレイ）。
 * - expert:   純ランダム（不可能盤面もあり得る挑戦モード）。
 */
const generateDeal = (difficulty: Difficulty): { tableau: Card[][]; stock: Card[] } => {
    if (difficulty === 'expert') return dealLayout();
    const isBeginner = difficulty === 'beginner';
    const make = isBeginner
        ? () => dealLayoutHighBiased(BEGINNER_FACE_POW, BEGINNER_STOCK_POW)
        : dealLayout;
    const accept = isBeginner
        ? (d: { tableau: Card[][]; stock: Card[] }) => isForwardWinnable(d.tableau, d.stock, 1)
        : (d: { tableau: Card[][]; stock: Card[] }) => isSolvable(d.tableau, d.stock, NORMAL_SOLVE_BUDGET);
    let last = make();
    for (let i = 0; i < MAX_DEAL_ATTEMPTS; i++) {
        if (accept(last)) return last;
        last = make();
    }
    return last; // 上限到達時のフォールバック（無限ループ防止）
};

/** 難易度ごとのヒント既定回数（999=実質無制限）。設定UIの「自動」で使われる。 */
export const defaultHints = (difficulty: Difficulty): number =>
    difficulty === 'expert' ? 1 : difficulty === 'normal' ? 3 : 999;

/**
 * @param hintLimit ユーザー設定のヒント上限。null なら難易度の既定値を使う。
 */
export const initializeGame = (difficulty: Difficulty, hintLimit: number | null = null): Partial<GameState> => {
    const { tableau, stock } = generateDeal(difficulty);

    return {
        stock,
        waste: [],
        foundation: [[], [], [], []],
        tableau,
        moves: 0,
        score: 0,
        time: 0,
        difficulty,
        isGameWon: false,
        gameStatus: 'playing',
        hint: null,
        hintsRemaining: hintLimit ?? defaultHints(difficulty),
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
    // priority: 小さいほど「良い手」。ヒントは moves[0] を採用するため、
    // 進展しない手（伏せ札をめくらない空列へのK移動など）を後ろへ回す。
    const moves: { from: string; to: string; priority: number }[] = [];

    // 1. 組札へ（各山の一番上のカード＋wasteトップのみ）— priority 0
    state.tableau.forEach((pile) => {
        if (pile.length === 0) return;
        const topCard = pile[pile.length - 1];
        if (!topCard.isFaceUp) return;
        state.foundation.forEach((fp, fi) => {
            if (canMoveToFoundation(topCard, fp)) moves.push({ from: topCard.id, to: `foundation-${fi}`, priority: 0 });
        });
    });
    if (state.waste.length > 0) {
        const wasteTop = state.waste[state.waste.length - 1];
        state.foundation.forEach((fp, fi) => {
            if (canMoveToFoundation(wasteTop, fp)) moves.push({ from: wasteTop.id, to: `foundation-${fi}`, priority: 0 });
        });
    }

    // 2. waste → 場札 — priority 1（手札を盤面に出すのは前進）
    if (state.waste.length > 0) {
        const wasteTop = state.waste[state.waste.length - 1];
        state.tableau.forEach((pile, i) => {
            if (canMoveToTableau(wasteTop, pile[pile.length - 1])) moves.push({ from: wasteTop.id, to: `tableau-${i}`, priority: 1 });
        });
    }

    // 3. 場札 → 場札 — 表向きカード（連番スタックの先頭）を移動
    state.tableau.forEach((pile, i) => {
        pile.forEach((card, idx) => {
            if (!card.isFaceUp) return;
            // この手で直下の伏せ札がめくれるか（idx>0 かつ 直下が伏せ）
            const uncovers = idx > 0 && !pile[idx - 1].isFaceUp;
            state.tableau.forEach((target, j) => {
                if (j === i) return;
                if (!canMoveToTableau(card, target[target.length - 1])) return;
                const toEmpty = target.length === 0;
                // priority: めくれる=1 / 非空列へ載せ替え=2 / 空列へ進展なし(K空列シャッフル)=4
                const priority = uncovers ? 1 : (!toEmpty ? 2 : 4);
                moves.push({ from: card.id, to: `tableau-${j}`, priority });
            });
        });
    });

    // priority 昇順で安定ソートし、ヒントが無駄手を避けるようにする
    moves.sort((a, b) => a.priority - b.priority);
    return moves.map(({ from, to }) => ({ from, to }));
};
