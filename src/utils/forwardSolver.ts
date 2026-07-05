import { Card } from '../types/game';

/**
 * 「前向き（フォワード）可解判定」— 伏せ札を覗かない“ふつうのプレイヤー”が
 * 手なりで解けるかを判定する。perfect-info の {@link isSolvable} と違い、
 * 伏せ札の中身を先読みせず、露出したカードだけで機械的に打つ。
 *
 * ここで true になる盤面は「単純な手順で最後まで上がれる」ことが保証されるので、
 * 初心者モードの“ほぼ必勝”な配りを選ぶフィルタに使う（人間は Undo もあるので更に有利）。
 *
 * 方針（実測で妥当な近似）:
 *  1. 安全に上げられるカードは組札へ（A/2は常に、それ以上は両逆色が rank-1 以上のとき）
 *  2. 伏せ札をめくれる 場札→場札 移動を最優先
 *  3. waste → 場札（手札を盤面へ）
 *  4. めくれない載せ替えは1局面につき1回だけ許容（無限ループ回避）
 *  5. どれも無ければドロー／リサイクル。山を2周しても打てなければ詰み(false)
 */

const isRed = (s: string) => s === 'hearts' || s === 'diamonds';

interface FCard { suit: string; rank: number; id: string; up: boolean }
interface FSim { t: FCard[][]; stock: FCard[]; waste: FCard[]; f: FCard[][]; drawN: number }

const canTab = (card: FCard, top: FCard | undefined): boolean => {
    if (!top) return card.rank === 13;
    return isRed(card.suit) !== isRed(top.suit) && card.rank === top.rank - 1;
};
const canFound = (card: FCard, pile: FCard[]): boolean => {
    if (pile.length === 0) return card.rank === 1;
    const top = pile[pile.length - 1];
    return card.suit === top.suit && card.rank === top.rank + 1;
};
const fRankOfSuit = (f: FCard[][], suit: string): number => {
    for (const p of f) if (p.length && p[p.length - 1].suit === suit) return p[p.length - 1].rank;
    return 0;
};
// 標準の安全オートプレイ規則
const safeToFoundation = (card: FCard, f: FCard[][]): boolean => {
    if (card.rank <= 2) return true;
    const redMin = Math.min(fRankOfSuit(f, 'hearts'), fRankOfSuit(f, 'diamonds'));
    const blackMin = Math.min(fRankOfSuit(f, 'clubs'), fRankOfSuit(f, 'spades'));
    return (isRed(card.suit) ? blackMin : redMin) >= card.rank - 1;
};
const foundationIndexFor = (card: FCard, f: FCard[][]): number => {
    for (let i = 0; i < f.length; i++) if (canFound(card, f[i])) return i;
    return -1;
};
// 末尾から続く「表向き＆交互色・降順」連番の開始 index（＝この山で動かせる run の先頭）
const faceUpRun = (pile: FCard[]): number => {
    if (pile.length === 0 || !pile[pile.length - 1].up) return -1;
    let s = pile.length - 1;
    while (s > 0) {
        const u = pile[s - 1], l = pile[s];
        if (u.up && isRed(u.suit) !== isRed(l.suit) && u.rank === l.rank + 1) s--;
        else break;
    }
    return s;
};
const sig = (s: FSim): string =>
    s.t.map(p => p.map(c => (c.up ? '' : 'x') + c.id).join(',')).join('|') +
    '#' + s.f.map(p => p.length).join('.') + '#' + s.stock.length + '/' + s.waste.map(c => c.id).join(',');

/** 実ゲームと同じ規則で手なりプレイし、勝てれば true。 */
export const isForwardWinnable = (tableau: Card[][], stock: Card[], drawN = 1): boolean => {
    const s: FSim = {
        t: tableau.map(p => p.map(c => ({ suit: c.suit, rank: c.rank, id: c.id, up: c.isFaceUp }))),
        stock: stock.map(c => ({ suit: c.suit, rank: c.rank, id: c.id, up: false })),
        waste: [],
        f: [[], [], [], []],
        drawN,
    };
    const seen = new Set<string>();
    let idle = 0, guard = 0;
    while (guard++ < 20000) {
        if (s.f.every(p => p.length === 13)) return true;

        // 1. 安全に上げられる組札手
        let moved = false;
        if (s.waste.length) {
            const c = s.waste[s.waste.length - 1];
            const fi = foundationIndexFor(c, s.f);
            if (fi >= 0 && safeToFoundation(c, s.f)) { s.f[fi].push(s.waste.pop()!); moved = true; }
        }
        if (!moved) for (const p of s.t) {
            if (!p.length) continue;
            const c = p[p.length - 1];
            if (!c.up) continue;
            const fi = foundationIndexFor(c, s.f);
            if (fi >= 0 && safeToFoundation(c, s.f)) {
                s.f[fi].push(p.pop()!);
                if (p.length && !p[p.length - 1].up) p[p.length - 1].up = true;
                moved = true;
                break;
            }
        }
        if (moved) { idle = 0; continue; }

        // 2. 伏せ札をめくれる 場札→場札 を最優先
        let best: { from: number; start: number; to: number; unc: boolean } | null = null;
        for (let i = 0; i < 7; i++) {
            const pile = s.t[i];
            const rs = faceUpRun(pile);
            if (rs < 0) continue;
            const head = pile[rs];
            const unc = rs > 0 && !pile[rs - 1].up;
            const whole = rs === 0; // 列を丸ごと動かす（空列間のK往復など無意味手）
            for (let j = 0; j < 7; j++) {
                if (j === i) continue;
                const tgt = s.t[j];
                if (!canTab(head, tgt[tgt.length - 1])) continue;
                if (tgt.length === 0 && whole) continue;
                const cand = { from: i, start: rs, to: j, unc };
                if (!best || (cand.unc && !best.unc)) best = cand;
            }
        }
        if (best && best.unc) {
            const run = s.t[best.from].splice(best.start);
            s.t[best.to].push(...run);
            const p = s.t[best.from];
            if (p.length && !p[p.length - 1].up) p[p.length - 1].up = true;
            idle = 0; continue;
        }

        // 3. waste → 場札
        if (s.waste.length) {
            const c = s.waste[s.waste.length - 1];
            let placed = -1;
            for (let j = 0; j < 7; j++) if (canTab(c, s.t[j][s.t[j].length - 1])) { placed = j; break; }
            if (placed >= 0) { s.t[placed].push(s.waste.pop()!); idle = 0; continue; }
        }

        // 4. めくれない載せ替え（将来の受けを作る）を局面ごと1回だけ
        if (best && !best.unc) {
            const key = sig(s) + '>' + best.from + best.start + best.to;
            if (!seen.has(key)) {
                seen.add(key);
                const run = s.t[best.from].splice(best.start);
                s.t[best.to].push(...run);
                idle = 0; continue;
            }
        }

        // 5. ドロー / リサイクル
        if (s.stock.length === 0 && s.waste.length === 0) return false;
        if (s.stock.length === 0) {
            s.stock = s.waste.map(c => ({ ...c, up: false }));
            s.waste = [];
            idle++;
            if (idle >= 2) return false; // 山を2周しても打てない＝詰み
            continue;
        }
        const n = Math.min(s.drawN, s.stock.length);
        const drawn = s.stock.splice(0, n).map(c => ({ ...c, up: true }));
        s.waste.push(...drawn);
    }
    return false;
};
