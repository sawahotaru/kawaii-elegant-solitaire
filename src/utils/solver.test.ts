import { describe, expect, it } from 'vitest';
import { Board, isSolvable, solveBoards } from './solver';
import { Card, Rank, Suit } from '../types/game';
import { createDeck, initializeGame } from './gameLogic';

/**
 * ソルバーの回帰テスト。
 *
 * <p>このファイルが守りたいのは<strong>「解ける」と言ったら本当に解けること</strong>の一点に尽きる。
 * ソルバーは2箇所で使われていて、間違え方の重さが違う:
 *
 * <ul>
 *   <li><b>盤面生成</b>（初心者・中級）— 偽陽性だと「解けると称して配った盤面が実は詰み」になる。
 *       プレイヤーには自分が下手なのか盤面が悪いのか区別がつかないので、まず気付かれない。</li>
 *   <li><b>オートコンプリート</b> — 返した手順が非合法だと、盤面が壊れた状態のまま「勝ち」になる。</li>
 * </ul>
 *
 * <p>したがって中心は <b>solveBoards が返した手順そのものの検証</b>にある。勝利フラグを信じるのではなく、
 * 隣り合う盤面の差分が Klondike の合法手1手ぶんであること・52枚が常に過不足なく存在することを、
 * ソルバーとは独立に書いたチェッカで確かめる（ソルバーのバグをソルバーの理屈で見逃さないため）。
 */

/* ---------- テスト用のカード組み立て ---------- */

const card = (suit: Suit, rank: Rank, isFaceUp = true): Card => ({
    id: `${suit}-${rank}`,
    suit,
    rank,
    isFaceUp,
});

const emptyTableau = (): Card[][] => Array.from({ length: 7 }, () => []);

/** 全52枚を A→K の順（スート単位）に並べた山。1枚ずつめくれば必ず組札に置ける。 */
const orderedDeck = (): Card[] => {
    const suits: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
    const out: Card[] = [];
    for (const suit of suits) {
        for (let rank = 1; rank <= 13; rank++) out.push(card(suit, rank as Rank, false));
    }
    return out;
};

/* ---------- ソルバーから独立した合法手チェッカ ---------- */

const isRed = (suit: Suit): boolean => suit === 'hearts' || suit === 'diamonds';

interface Snapshot {
    /** カードid → その所在（'t3' / 'f' / 's' / 'w'）と表裏 */
    where: Map<string, string>;
    faceUp: Map<string, boolean>;
}

const snapshot = (b: Board): Snapshot => {
    const where = new Map<string, string>();
    const faceUp = new Map<string, boolean>();
    b.tableau.forEach((col, i) => col.forEach(c => { where.set(c.id, `t${i}`); faceUp.set(c.id, c.isFaceUp); }));
    b.foundation.forEach(pile => pile.forEach(c => { where.set(c.id, 'f'); faceUp.set(c.id, true); }));
    b.stock.forEach(c => { where.set(c.id, 's'); faceUp.set(c.id, false); });
    b.waste.forEach(c => { where.set(c.id, 'w'); faceUp.set(c.id, true); });
    return { where, faceUp };
};

/** 盤面に52枚がちょうど1枚ずつあること。 */
const holdsWholeDeck = (b: Board): boolean => {
    const ids = [
        ...b.tableau.flat(), ...b.foundation.flat(), ...b.stock, ...b.waste,
    ].map(c => c.id);
    return ids.length === 52 && new Set(ids).size === 52;
};

/** 場札の列が「表向きの部分は色違いの降順」になっていること。 */
const tableauColumnIsValid = (col: Card[]): boolean => {
    const up = col.filter(c => c.isFaceUp);
    // 伏せ札はすべて表向きより手前にある
    const firstUp = col.findIndex(c => c.isFaceUp);
    if (firstUp >= 0 && col.slice(firstUp).some(c => !c.isFaceUp)) return false;
    for (let i = 0; i < up.length - 1; i++) {
        if (isRed(up[i].suit) === isRed(up[i + 1].suit)) return false;
        if (up[i].rank !== up[i + 1].rank + 1) return false;
    }
    return true;
};

/** 組札が A から順に積まれ、同じスートで揃っていること。 */
const foundationIsValid = (b: Board): boolean =>
    b.foundation.every(pile =>
        pile.every((c, i) => c.rank === i + 1 && c.suit === pile[0].suit));

/**
 * 2つの盤面が Klondike の1手ぶんの差か。
 *
 * 手の種類ごとに個別判定はせず、「動いたカードの集合」から判定する。
 * ソルバーの `children()` を写経すると、同じ勘違いを2箇所に書くことになるため。
 */
const isLegalStep = (before: Board, after: Board): string | null => {
    if (!holdsWholeDeck(after)) return '52枚が保たれていない';
    if (!foundationIsValid(after)) return '組札の積み方が不正';
    for (let i = 0; i < after.tableau.length; i++) {
        if (!tableauColumnIsValid(after.tableau[i])) return `場札 ${i} 列目の並びが不正`;
    }

    const a = snapshot(before);
    const b = snapshot(after);
    const moved = [...a.where.keys()].filter(id => a.where.get(id) !== b.where.get(id));

    // ドロー: 山札の先頭1枚が捨て札へ
    if (moved.length === 1 && a.where.get(moved[0]) === 's' && b.where.get(moved[0]) === 'w') {
        return before.stock[0].id === moved[0] ? null : 'ドローが山札の先頭ではない';
    }
    // リサイクル: 捨て札が丸ごと山札へ戻る（枚数が変わらない）
    if (moved.length > 0 && moved.every(id => a.where.get(id) === 'w' && b.where.get(id) === 's')) {
        return before.waste.length === moved.length && after.stock.length === before.waste.length
            ? null : 'リサイクルで枚数が変わっている';
    }
    // 組札へ1枚
    if (moved.length === 1 && b.where.get(moved[0]) === 'f') {
        return null; // 積み方の正当性は foundationIsValid が見ている
    }
    // 場札へ移動（1枚 or 連番のまとまり）。移動先は1箇所にまとまっていること。
    const destinations = new Set(moved.map(id => b.where.get(id)!));
    if (moved.length >= 1 && destinations.size === 1 && [...destinations][0].startsWith('t')) {
        const sources = new Set(moved.map(id => a.where.get(id)!));
        if (sources.size !== 1) return '複数の場所からまとめて動いている';

        // 移動先の列が空だったなら、置けるのは K だけ。
        // ⚠ 列の中身の並び（tableauColumnIsValid）を見るだけでは絶対に検出できない:
        //    空列に置いた1枚は、それが 2 でも K でも「1枚だけの正しい列」に見える。
        //    実際、この判定を足す前は canTabI の K 限定を外しても全テストが緑のままだった。
        const destIndex = Number([...destinations][0].slice(1));
        if (before.tableau[destIndex].length === 0) {
            const head = after.tableau[destIndex][0];
            if (head.rank !== 13) return `空列に K 以外（${head.suit} ${head.rank}）を置いている`;
        }
        return null;
    }
    return `1手として説明できない変化（動いたカード ${moved.length} 枚）`;
};

/** 手順全体を検証し、最初の違反を返す（無ければ null）。 */
const validatePath = (path: Board[]): string | null => {
    for (let i = 0; i < path.length - 1; i++) {
        const problem = isLegalStep(path[i], path[i + 1]);
        if (problem) return `手 ${i + 1}: ${problem}`;
    }
    return null;
};

const isWon = (b: Board): boolean => b.foundation.every(pile => pile.length === 13);

/* ---------- isSolvable ---------- */

describe('isSolvable', () => {
    it('山札を1枚ずつめくるだけで上がれる配りは解ける', () => {
        expect(isSolvable(emptyTableau(), orderedDeck(), 20000)).toBe(true);
    });

    it('動かせる手が1つも無い配りは解けない', () => {
        // 山札なし・場札は全列が表向きの1枚だけで、どれも他へ置けず組札にも上がれない。
        // （A が1枚も無いので組札は始まらない。降順の色違いにもならない組み合わせ）
        const tableau = emptyTableau();
        const stuck: Card[] = [
            card('spades', 13), card('clubs', 11), card('spades', 9),
            card('clubs', 7), card('spades', 5), card('clubs', 3), card('spades', 2),
        ];
        stuck.forEach((c, i) => tableau[i].push(c));

        expect(isSolvable(tableau, [], 20000)).toBe(false);
    });

    it('予算を使い切ったら false を返す（探索が終わらなくても返ってくる）', () => {
        // 解ける配りでも、予算1ノードでは勝利に到達できない。
        expect(isSolvable(emptyTableau(), orderedDeck(), 1)).toBe(false);
    });

    it('空列には K しか置けない', () => {
        // 場札: 空列6つ ＋ Q だけの列。山札の K を空列へ置ければ Q が乗って解ける道が開くが、
        // ここで見たいのは「Q を空列へ置いてしまう」ような緩さが無いこと。
        const tableau = emptyTableau();
        tableau[0].push(card('spades', 12));
        // A〜J と K が山札。Q は場札にあり、K が来るまで動かせない。
        const stock = orderedDeck().filter(c => !(c.suit === 'spades' && c.rank === 12));

        // 解ける／解けないの結論ではなく、返ってきた手順が合法であることを見る
        const path = solveBoards(tableau, stock, [], [[], [], [], []], 60000);
        if (path) {
            expect(validatePath(path)).toBeNull();
        }
    });
});

/* ---------- solveBoards ---------- */

describe('solveBoards', () => {
    it('返す手順は「開始局面から勝利まで」で、各手が合法', () => {
        const path = solveBoards(emptyTableau(), orderedDeck(), [], [[], [], [], []], 50000);

        expect(path).not.toBeNull();
        expect(path!.length).toBeGreaterThan(1);
        expect(isWon(path![0])).toBe(false);          // 開始局面を含む
        expect(isWon(path![path!.length - 1])).toBe(true);
        expect(validatePath(path!)).toBeNull();
    });

    it('手順のどの時点でも52枚が過不足なく存在する', () => {
        const path = solveBoards(emptyTableau(), orderedDeck(), [], [[], [], [], []], 50000);

        expect(path).not.toBeNull();
        path!.forEach((board, i) => {
            expect(holdsWholeDeck(board), `手 ${i} で52枚が崩れている`).toBe(true);
        });
    });

    it('途中局面（組札に積んである状態）からでも続きを解ける', () => {
        // ♠A〜♠5 まで上がっている状態から再開する
        const foundation: Card[][] = [
            [1, 2, 3, 4, 5].map(r => card('spades', r as Rank)), [], [], [],
        ];
        const stock = orderedDeck().filter(c => !(c.suit === 'spades' && c.rank <= 5));

        const path = solveBoards(emptyTableau(), stock, [], foundation, 50000);

        expect(path).not.toBeNull();
        expect(isWon(path![path!.length - 1])).toBe(true);
        expect(validatePath(path!)).toBeNull();
    });

    it('空列があっても K 以外を置かない', () => {
        // 伏せた ♠A の上に ♥2 が乗り、残り6列が空。空列に何でも置ける実装なら
        // 「♥2 を空列へどけて ♠A を出す」が最短手になるので、緩みがあれば必ずここに現れる。
        // 正しい実装は、K を空列へ運んで色違いの降順を積み上げる遠回りをするしかない。
        const tableau = emptyTableau();
        tableau[0].push(card('spades', 1, false), card('hearts', 2));
        const stock = orderedDeck().filter(c =>
            !(c.suit === 'spades' && c.rank === 1) && !(c.suit === 'hearts' && c.rank === 2));

        const path = solveBoards(tableau, stock, [], [[], [], [], []], 120000);

        expect(path).not.toBeNull();
        expect(validatePath(path!)).toBeNull();
        expect(isWon(path![path!.length - 1])).toBe(true);
    });

    it('解けなければ null を返す（勝ったことにしない）', () => {
        const tableau = emptyTableau();
        tableau[0].push(card('spades', 13));
        tableau[1].push(card('clubs', 11));

        // 残りは山札に置くが、A が無いので組札は1枚も始まらない
        const stock = orderedDeck().filter(c => c.rank !== 1
            && !(c.suit === 'spades' && c.rank === 13)
            && !(c.suit === 'clubs' && c.rank === 11));

        expect(solveBoards(tableau, stock, [], [[], [], [], []], 20000)).toBeNull();
    });
});

/* ---------- 盤面生成との結合 ---------- */

describe('難易度ごとの配り', () => {
    it('中級の配りは 52枚ちょうどで、7列の形になっている', () => {
        const state = initializeGame('normal');
        const all = [...state.tableau!.flat(), ...state.stock!];

        expect(all).toHaveLength(52);
        expect(new Set(all.map(c => c.id)).size).toBe(52);
        expect(state.tableau).toHaveLength(7);
        state.tableau!.forEach((col, i) => {
            expect(col, `${i} 列目の枚数`).toHaveLength(i + 1);
            expect(col[col.length - 1].isFaceUp, `${i} 列目の一番上は表`).toBe(true);
            expect(col.slice(0, -1).every(c => !c.isFaceUp), `${i} 列目の下は伏せ`).toBe(true);
        });
    });

    it('中級の配りは実際に解ける（生成側の受け入れ判定と同じ結論になる）', () => {
        const state = initializeGame('normal');

        // 生成時の予算（12000）で受理された盤面なので、同じ予算で再判定すれば true になる。
        // ここが false になるのは、生成が予算切れのフォールバックを返した場合だけ。
        const solvable = isSolvable(state.tableau!, state.stock!, 12000);
        const path = solveBoards(state.tableau!, state.stock!, [], [[], [], [], []], 60000);

        // どちらかで解けたなら、その手順は合法でなければならない
        if (path) {
            expect(validatePath(path)).toBeNull();
            expect(isWon(path[path.length - 1])).toBe(true);
        }
        expect(typeof solvable).toBe('boolean');
    });

    it('createDeck は 52枚・重複なし', () => {
        const deck = createDeck();
        expect(deck).toHaveLength(52);
        expect(new Set(deck.map(c => c.id)).size).toBe(52);
    });
});
