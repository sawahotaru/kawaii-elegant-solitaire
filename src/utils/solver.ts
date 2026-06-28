import { Card, Suit } from '../types/game';

/**
 * Klondike 可解判定ソルバー（最良優先DFS, ノード予算上限つき）。
 *
 * - 合法手のみを生成するため `isSolvable === true` は「実在する手順で勝利可能」を保証する（偽陽性なし）。
 * - 予算 `nodeBudget` 内で勝利に到達できなければ false を返す（＝不可解とは限らないが、
 *   「解ける盤面ジェネレータ」ではこれを不採用とすることで易しめの盤面に寄せられる）。
 * - 手の規則・ドロー/リサイクル順は実ゲーム（draw-1, 無制限リサイクル）に一致させている。
 */

const SUIT_IDX: Record<Suit, number> = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 };
const enc = (c: Card): number => SUIT_IDX[c.suit] * 13 + (c.rank - 1);
const rankOf = (x: number): number => (x % 13) + 1;
const suitOf = (x: number): number => Math.floor(x / 13);
const isRedI = (x: number): boolean => suitOf(x) % 2 === 1; // hearts(1) / diamonds(3)

interface Pile { d: number[]; u: number[]; } // d=伏せ札, u=表向き
interface SState { piles: Pile[]; f: number[]; stock: number[]; waste: number[]; }

const canTabI = (card: number, top: number | undefined): boolean => {
    if (top === undefined) return rankOf(card) === 13; // 空列はKのみ
    return isRedI(card) !== isRedI(top) && rankOf(card) === rankOf(top) - 1;
};

const cloneS = (s: SState): SState => ({
    piles: s.piles.map(p => ({ d: p.d.slice(), u: p.u.slice() })),
    f: s.f.slice(),
    stock: s.stock.slice(),
    waste: s.waste.slice(),
});

const keyS = (s: SState): string => {
    const ps = s.piles.map(p => 'd' + p.d.join('.') + 'u' + p.u.join('.')).sort();
    return ps.join('|') + '#' + s.f.join('.') + '#S' + s.stock.join('.') + 'W' + s.waste.join('.');
};

const isWon = (s: SState): boolean => s.f[0] + s.f[1] + s.f[2] + s.f[3] === 52;

const children = (s: SState): SState[] => {
    const out: SState[] = [];
    const wtop = s.waste.length ? s.waste[s.waste.length - 1] : null;

    // waste -> 組札
    if (wtop !== null && s.f[suitOf(wtop)] === rankOf(wtop) - 1) {
        const n = cloneS(s); n.waste.pop(); n.f[suitOf(wtop)]++; out.push(n);
    }
    // 各山top -> 組札
    s.piles.forEach((p, i) => {
        if (!p.u.length) return;
        const c = p.u[p.u.length - 1];
        if (s.f[suitOf(c)] === rankOf(c) - 1) {
            const n = cloneS(s);
            n.piles[i].u.pop();
            if (!n.piles[i].u.length && n.piles[i].d.length) n.piles[i].u.push(n.piles[i].d.pop()!);
            n.f[suitOf(c)]++;
            out.push(n);
        }
    });
    // waste -> 場札
    if (wtop !== null) {
        s.piles.forEach((p, i) => {
            const empty = p.u.length === 0 && p.d.length === 0;
            const t = p.u.length ? p.u[p.u.length - 1] : undefined;
            if (empty ? canTabI(wtop, undefined) : (p.u.length > 0 && canTabI(wtop, t))) {
                const n = cloneS(s); n.waste.pop(); n.piles[i].u.push(wtop); out.push(n);
            }
        });
    }
    // 場札の表向き連番 -> 他の場札
    s.piles.forEach((p, i) => {
        const u = p.u;
        let kk = -1;
        for (let k = 0; k < u.length; k++) {
            let ok = true;
            for (let j = k; j < u.length - 1; j++) {
                if (!(isRedI(u[j]) !== isRedI(u[j + 1]) && rankOf(u[j]) === rankOf(u[j + 1]) + 1)) { ok = false; break; }
            }
            if (ok) { kk = k; break; }
        }
        if (kk < 0) return;
        for (let k = kk; k < u.length; k++) {
            const head = u[k];
            s.piles.forEach((q, j) => {
                if (j === i) return;
                const empty = q.u.length === 0 && q.d.length === 0;
                const qt = q.u.length ? q.u[q.u.length - 1] : undefined;
                if ((empty && canTabI(head, undefined)) || (q.u.length > 0 && canTabI(head, qt))) {
                    // 全表向きの山を空列へ丸ごと移すだけ（K空列シャッフル等）は無意味なので枝刈り
                    if (empty && k === kk && p.d.length === 0) return;
                    const n = cloneS(s);
                    const run = n.piles[i].u.splice(k);
                    n.piles[j].u.push(...run);
                    if (!n.piles[i].u.length && n.piles[i].d.length) n.piles[i].u.push(n.piles[i].d.pop()!);
                    out.push(n);
                }
            });
        }
    });
    // ドロー / リサイクル（実ゲーム準拠: draw-1, リサイクルは順序保持＝先頭から再ドロー）
    if (s.stock.length) {
        const n = cloneS(s); n.waste.push(n.stock.shift()!); out.push(n);
    } else if (s.waste.length) {
        const n = cloneS(s); n.stock = n.waste.slice(); n.waste = []; out.push(n);
    }
    return out;
};

const heur = (s: SState): number => {
    let fd = 0;
    s.piles.forEach(p => { fd += p.d.length; });
    return (s.f[0] + s.f[1] + s.f[2] + s.f[3]) * 100 - fd * 5 - s.stock.length;
};

/**
 * 配り（tableau: 表伏せ込み, stock: 伏せ札列）が予算内で解けるか。
 */
export const isSolvable = (tableau: Card[][], stock: Card[], nodeBudget: number): boolean => {
    const start: SState = {
        piles: tableau.map(col => {
            const d: number[] = [], u: number[] = [];
            col.forEach(c => { (c.isFaceUp ? u : d).push(enc(c)); });
            return { d, u };
        }),
        f: [0, 0, 0, 0],
        stock: stock.map(enc),
        waste: [],
    };
    const visited = new Set<string>();
    const stack: SState[] = [start];
    let nodes = 0;
    while (stack.length && nodes < nodeBudget) {
        const s = stack.pop()!;
        nodes++;
        if (isWon(s)) return true;
        const k = keyS(s);
        if (visited.has(k)) continue;
        visited.add(k);
        const ch = children(s).filter(c => !visited.has(keyS(c)));
        ch.sort((a, b) => heur(a) - heur(b)); // 良い手を後ろ＝先に pop
        for (const c of ch) stack.push(c);
    }
    return false;
};
