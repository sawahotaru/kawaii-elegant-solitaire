import React, { useState, useEffect } from 'react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    closestCorners,
    defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { motion, AnimatePresence } from 'framer-motion';
import { Undo2, Lightbulb, RotateCcw, Award, Clock, MousePointer2, Volume2, VolumeX, Sparkles } from 'lucide-react';

import { useGameState } from './hooks/useGameState';
import { audio } from './utils/audio';
import { Card } from './components/Card';
import { DroppablePile } from './components/DroppablePile';
import { canMoveToTableau, canMoveToFoundation } from './utils/gameLogic';
import { Card as CardType, Difficulty } from './types/game';

const DIFFICULTIES: { key: Difficulty; label: string }[] = [
    { key: 'beginner', label: '初心者' },
    { key: 'normal', label: '中級' },
    { key: 'expert', label: '上級' },
];

const HINT_OPTIONS: { key: string; label: string }[] = [
    { key: 'auto', label: '自動' },
    { key: '3', label: '3' },
    { key: '5', label: '5' },
    { key: '10', label: '10' },
    { key: 'inf', label: '∞' },
];

const App: React.FC = () => {
    // 起動時の難易度は前回選択を復元（初回は初心者）。
    const [initialDifficulty] = useState<Difficulty>(() => {
        try {
            const s = localStorage.getItem('kawaii-difficulty');
            if (s === 'beginner' || s === 'normal' || s === 'expert') return s;
        } catch { /* ignore */ }
        return 'beginner';
    });
    // ヒント上限の設定（'auto'=難易度準拠 / '3' / '5' / '10' / 'inf'=無制限）。前回選択を復元。
    const [hintKey, setHintKey] = useState<string>(() => {
        try {
            const s = localStorage.getItem('kawaii-hintlimit');
            if (s && ['auto', '3', '5', '10', 'inf'].includes(s)) return s;
        } catch { /* ignore */ }
        return 'auto';
    });
    const hintValue = (k: string): number | null => (k === 'auto' ? null : k === 'inf' ? 999 : parseInt(k, 10));

    const { state, drawCards, moveCards, undo, showHint, restart, autoComplete, setHintLimit } = useGameState(initialDifficulty, hintValue(hintKey));

    const changeDifficulty = (d: Difficulty) => {
        if (d === state.difficulty) return;
        try { localStorage.setItem('kawaii-difficulty', d); } catch { /* ignore */ }
        restart(d);
    };

    const changeHintLimit = (k: string) => {
        setHintKey(k);
        try { localStorage.setItem('kawaii-hintlimit', k); } catch { /* ignore */ }
        setHintLimit(hintValue(k));
    };

    const [activeCardId, setActiveCardId] = useState<string | null>(null);
    const [activeStack, setActiveStack] = useState<CardType[]>([]);
    const [muted, setMuted] = useState<boolean>(() => {
        // Music/sound is muted by default; only unmuted if the user previously opted in.
        // The key is versioned (-v2) so stale '0' values written by older builds, which
        // always autosaved an unmuted preference, no longer suppress the muted default.
        try {
            const stored = localStorage.getItem('kawaii-muted-v2');
            return stored === null ? true : stored === '1';
        } catch { return true; }
    });

    // Sync mute state to the audio engine and persist the preference.
    useEffect(() => {
        audio.setMuted(muted);
        try { localStorage.setItem('kawaii-muted-v2', muted ? '1' : '0'); } catch { /* ignore */ }
    }, [muted]);

    // Unlock audio + start BGM on the first user gesture (autoplay policy).
    useEffect(() => {
        const unlock = () => { audio.resume(); window.removeEventListener('pointerdown', unlock); };
        window.addEventListener('pointerdown', unlock);
        return () => window.removeEventListener('pointerdown', unlock);
    }, []);

    // Victory fanfare.
    useEffect(() => {
        if (state.isGameWon) audio.playWin();
    }, [state.isGameWon]);

    // 画面幅でカードの重なり量を切り替える（sm ブレークポイント=640px 未満をコンパクト扱い）。
    // 固定pxの重なり(-80/-90)はPCのカード高(112px)前提で、モバイルのカード高(80px)では
    // 重なりすぎてランク/スートが隠れるため、モバイルでは浅い重なりにする。
    const [isCompact, setIsCompact] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 639px)');
        const update = () => setIsCompact(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);
    const faceUpGap = isCompact ? '-52px' : '-80px';   // 表向きの重なり（モバイルは28px見せる）
    const faceDownGap = isCompact ? '-62px' : '-90px'; // 伏せ札の重なり（モバイルは18px見せる）

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const card = active.data.current?.card as CardType;
        const sourceType = active.data.current?.sourceType;
        const sourceIndex = active.data.current?.sourceIndex;

        if (!card) return;

        setActiveCardId(card.id);

        if (sourceType === 'tableau' && sourceIndex !== undefined) {
            const pile = state.tableau[sourceIndex];
            const index = pile.findIndex(c => c.id === card.id);
            if (index !== -1) {
                setActiveStack(pile.slice(index));
            } else {
                // Fallback: This shouldn't happen, but prevent crash
                setActiveStack([card]);
            }
        } else {
            setActiveStack([card]);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { over, active } = event;

        // Reset state immediately but keep reference for logic
        const currentActiveStack = [...activeStack];
        setActiveCardId(null);
        setActiveStack([]);

        if (!over) return;

        const sourceData = active.data.current;
        const targetData = over.data.current;
        const card = sourceData?.card as CardType;

        if (!sourceData || !targetData || !card) return;

        let isValid = false;
        if (targetData.type === 'tableau') {
            const targetPile = state.tableau[targetData.index];
            const targetCard = targetPile.length > 0 ? targetPile[targetPile.length - 1] : undefined;
            isValid = canMoveToTableau(card, targetCard);
        } else if (targetData.type === 'foundation') {
            const targetPile = state.foundation[targetData.index];
            // Stack dragging is only allowed for a single card to foundation
            if (currentActiveStack.length === 1 && canMoveToFoundation(card, targetPile)) {
                isValid = true;
            }
        }

        if (isValid) {
            moveCards(
                sourceData.sourceType,
                sourceData.sourceIndex,
                currentActiveStack.map(c => c.id),
                targetData.type,
                targetData.index
            );
            if (targetData.type === 'foundation') audio.playFoundation();
            else audio.playMove();
        } else {
            audio.playInvalid();
        }
    };

    const handleAutoMove = (card: CardType, sourceType: string, sourceIndex?: number) => {
        // Prevent auto-move if dragging is active
        if (activeCardId) return;

        // 判定用：そのカードがその山の「一番上（露出している）」カードかどうか
        const isTopCard = (() => {
            if (sourceType === 'waste') return true;
            if (sourceType === 'tableau' && sourceIndex !== undefined) {
                const pile = state.tableau[sourceIndex];
                return pile[pile.length - 1].id === card.id;
            }
            return false;
        })();

        // 1. 組札（Foundation）への自動移動：一番上のカードのみ許可
        if (isTopCard) {
            for (let i = 0; i < 4; i++) {
                if (canMoveToFoundation(card, state.foundation[i])) {
                    moveCards(sourceType, sourceIndex, [card.id], 'foundation', i);
                    audio.playFoundation();
                    return;
                }
            }
        }

        // 2. 場札（Tableau）への自動移動：こちらは連番（スタック）での移動を許可
        for (let i = 0; i < 7; i++) {
            if (sourceType === 'tableau' && sourceIndex === i) continue;
            const targetCard = state.tableau[i].length > 0 ? state.tableau[i][state.tableau[i].length - 1] : undefined;
            if (canMoveToTableau(card, targetCard)) {
                moveCards(sourceType, sourceIndex, [card.id], 'tableau', i);
                audio.playMove();
                return;
            }
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // 全札が表向きになったら「一括あがり」を提示（伏せ札ゼロ＝あとは組札へ送るだけ）
    const canAutoComplete =
        state.gameStatus === 'playing' &&
        state.tableau.some(pile => pile.length > 0) &&
        state.tableau.every(pile => pile.every(c => c.isFaceUp));

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
                setActiveCardId(null);
                setActiveStack([]);
            }}
            collisionDetection={closestCorners}
        >
            <div className="min-h-screen bg-game-bg text-gray-800 font-sans selection:bg-pink-200">

                {/* Header HUD */}
                <header className="fixed top-0 inset-x-0 h-[92px] sm:h-[88px] bg-white/60 backdrop-blur-md z-50 border-b border-pink-100 shadow-sm px-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-4">
                        <div className="bg-pink-100/50 p-2 rounded-xl hidden sm:block">
                            <Award className="text-pink-500 w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-sm sm:text-lg font-bold text-pink-600 leading-tight">Kawaii Solitaire</h1>
                            <div className="flex gap-1 mt-0.5">
                                {DIFFICULTIES.map(d => (
                                    <button
                                        key={d.key}
                                        onClick={() => changeDifficulty(d.key)}
                                        title={`難易度: ${d.label}`}
                                        className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-bold transition-all active:scale-95 ${state.difficulty === d.key ? 'bg-pink-500 text-white shadow' : 'bg-pink-100/60 text-pink-400 hover:bg-pink-200/70'}`}
                                    >
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-1 mt-0.5 items-center">
                                <span className="text-[9px] sm:text-[10px] text-pink-300 font-bold uppercase mr-0.5 flex items-center gap-0.5">
                                    <Lightbulb className="w-2.5 h-2.5" />
                                </span>
                                {HINT_OPTIONS.map(o => (
                                    <button
                                        key={o.key}
                                        onClick={() => changeHintLimit(o.key)}
                                        title={`ヒント上限: ${o.key === 'auto' ? '難易度準拠' : o.key === 'inf' ? '無制限' : o.label}`}
                                        className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full font-bold transition-all active:scale-95 ${hintKey === o.key ? 'bg-pink-400 text-white shadow' : 'bg-pink-100/50 text-pink-400 hover:bg-pink-200/60'}`}
                                    >
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-8">
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] sm:text-xs text-pink-400 font-bold uppercase">Score</span>
                            <span className="text-sm sm:text-xl font-black text-pink-600 tabular-nums">{state.score}</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] sm:text-xs text-pink-400 font-bold uppercase">Time</span>
                            <span className="text-sm sm:text-xl font-black text-pink-600 tabular-nums flex items-center gap-1">
                                <Clock className="w-3 h-3 sm:w-4 sm:h-4" /> {formatTime(state.time)}
                            </span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] sm:text-xs text-pink-400 font-bold uppercase">Moves</span>
                            <span className="text-sm sm:text-xl font-black text-pink-600 tabular-nums">{state.moves}</span>
                        </div>
                    </div>

                    <div className="flex gap-1 sm:gap-2">
                        <button
                            onClick={() => setMuted(m => !m)}
                            className="p-2 sm:p-3 bg-white text-pink-500 rounded-xl hover:bg-pink-50 shadow-sm border border-pink-50 transition-all active:scale-95"
                            title={muted ? 'Unmute' : 'Mute'}
                        >
                            {muted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                        </button>
                        <button
                            onClick={() => { audio.playUndo(); undo(); }}
                            className="p-2 sm:p-3 bg-white text-pink-500 rounded-xl hover:bg-pink-50 shadow-sm border border-pink-50 transition-all active:scale-95"
                            title="Undo"
                        >
                            <Undo2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                        <button
                            onClick={() => { audio.playHint(); showHint(); }}
                            disabled={state.hintsRemaining <= 0}
                            className={`p-2 sm:p-3 bg-white text-pink-500 rounded-xl shadow-sm border border-pink-50 transition-all active:scale-95 flex flex-col items-center justify-center relative ${state.hintsRemaining <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-pink-50'}`}
                            title="Hint"
                        >
                            <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5" />
                            {state.hintsRemaining < 999 && (
                                <span className="absolute -top-2 -right-2 bg-pink-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
                                    {state.hintsRemaining}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => restart()}
                            className="p-2 sm:p-3 bg-pink-500 text-white rounded-xl hover:bg-pink-600 shadow-lg shadow-pink-200 transition-all active:scale-95"
                            title="New Game"
                        >
                            <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    </div>
                </header>

                {/* Game Layout */}
                <main className="pt-24 sm:pt-32 pb-8 px-4 max-w-5xl mx-auto flex flex-col gap-6 sm:gap-12">

                    {/* Top Row: Stock & Foundation */}
                    <section className="grid grid-cols-7 gap-2 sm:gap-4">
                        {/* Stock & Waste */}
                        <div className="col-span-3 flex gap-2 sm:gap-6">
                            <div className="relative group cursor-pointer" onClick={() => { audio.playDraw(); drawCards(); }}>
                                <div className="w-12 sm:w-20 h-20 sm:h-28 rounded-xl border-2 border-pink-200/50 bg-pink-100/30 border-dashed flex items-center justify-center">
                                    <RotateCcw className="text-pink-200 w-6 h-6" />
                                </div>
                                {state.stock.length > 0 && (
                                    <Card
                                        key="stock-card-top"
                                        card={{ ...state.stock[0], id: 'stock-card' }}
                                        className="absolute top-0 left-0"
                                    />
                                )}
                                <div className="absolute -bottom-6 left-0 right-0 text-[10px] text-center text-pink-300 font-bold uppercase tracking-tighter">Stock</div>
                            </div>

                            <div className="relative">
                                <div className="w-12 sm:w-20 h-20 sm:h-28 rounded-xl border-2 border-pink-200/30" />
                                {state.waste.length > 0 && (
                                    <Card
                                        key={`${state.waste[state.waste.length - 1].id}-${state.waste[state.waste.length - 1].isFaceUp}`}
                                        card={state.waste[state.waste.length - 1]}
                                        sourceType="waste"
                                        onDoubleClick={() => handleAutoMove(state.waste[state.waste.length - 1], 'waste')}
                                        isHinted={state.hint?.from === state.waste[state.waste.length - 1].id}
                                        className="absolute top-0 left-0"
                                    />
                                )}
                                <div className="absolute -bottom-6 left-0 right-0 text-[10px] text-center text-pink-300 font-bold uppercase tracking-tighter">Waste</div>
                            </div>
                        </div>

                        <div className="col-span-1" />

                        {/* Foundation */}
                        <div className="col-span-3 flex justify-end gap-1 sm:gap-4">
                            {state.foundation.map((pile, i) => (
                                <div key={i} className="relative">
                                    <DroppablePile
                                        id={`foundation-${i}`}
                                        type="foundation"
                                        index={i}
                                        className="w-12 sm:w-20 h-20 sm:h-28"
                                    >
                                        {pile.length === 0 && (
                                            <div className="absolute inset-0 flex items-center justify-center opacity-10">
                                                <Award className="w-8 h-8" />
                                            </div>
                                        )}
                                        {pile.map((card, idx) => (
                                            <Card
                                                key={card.id}
                                                card={card}
                                                sourceType="foundation"
                                                sourceIndex={i}
                                                className="absolute top-0 left-0"
                                            />
                                        ))}
                                    </DroppablePile>
                                    <div className="absolute -bottom-6 left-0 right-0 text-[10px] text-center text-pink-300 font-bold uppercase tracking-tighter">Suit {i + 1}</div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Bottom Row: Tableau */}
                    <section className="grid grid-cols-7 gap-0.5 sm:gap-4 relative z-0">
                        {state.tableau.map((pile, i) => (
                            <DroppablePile
                                key={i}
                                id={`tableau-${i}`}
                                type="tableau"
                                index={i}
                                className="min-h-[300px] w-full bg-white/5 rounded-xl border-dashed border-2 border-pink-100/20 relative"
                                style={{ zIndex: 50 - i }}
                            >
                                <div className="flex flex-col items-center">
                                    {pile.map((card, idx) => (
                                        <Card
                                            key={`${card.id}-${card.isFaceUp}`}
                                            card={card}
                                            sourceType="tableau"
                                            sourceIndex={i}
                                            isHinted={state.hint?.from === card.id || state.hint?.to === `tableau-${i}`}
                                            isBeingDragged={activeStack.some(c => c.id === card.id)}
                                            onDoubleClick={() => handleAutoMove(card, 'tableau', i)}
                                            style={{
                                                marginTop: idx === 0 ? 0 : (card.isFaceUp ? faceUpGap : faceDownGap),
                                                zIndex: idx,
                                            }}
                                            className="sm:scale-100 transform"
                                        />
                                    ))}
                                </div>
                            </DroppablePile>
                        ))}
                    </section>
                </main>

                {/* Drag Overlay */}
                <DragOverlay
                    className="pointer-events-none"
                    dropAnimation={{
                        sideEffects: defaultDropAnimationSideEffects({
                            styles: {
                                active: {
                                    opacity: '0.5',
                                },
                            },
                        }),
                    }}
                >
                    {activeCardId && activeStack.length > 0 && (
                        <div className="flex flex-col items-center">
                            {activeStack.map((card, idx) => (
                                <Card
                                    key={card.id}
                                    card={card}
                                    isOverlay
                                    style={{
                                        marginTop: idx === 0 ? 0 : faceUpGap,
                                        zIndex: 1000 + idx,
                                    }}
                                    className="shadow-2xl opacity-100"
                                />
                            ))}
                        </div>
                    )}
                </DragOverlay>

                {/* Victory Screen */}
                <AnimatePresence>
                    {state.isGameWon && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] bg-pink-500/80 backdrop-blur-lg flex flex-col items-center justify-center p-8 text-white overflow-hidden"
                        >
                            <motion.div
                                initial={{ scale: 0.8, y: 50 }}
                                animate={{ scale: 1, y: 0 }}
                                className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center text-center gap-6 max-w-md border-8 border-pink-200"
                            >
                                <div className="w-24 h-24 bg-pink-100 rounded-full flex items-center justify-center mb-4">
                                    <Award className="w-12 h-12 text-pink-500 animate-bounce" />
                                </div>
                                <h2 className="text-4xl font-black text-pink-500">Perfect!</h2>
                                <p className="text-pink-400 font-bold mb-4">You solved the solitaire with elegance.</p>

                                <div className="grid grid-cols-2 gap-4 w-full">
                                    <div className="bg-pink-50 p-4 rounded-3xl">
                                        <div className="text-pink-300 text-xs font-black uppercase">Score</div>
                                        <div className="text-pink-500 text-2xl font-black">{state.score}</div>
                                    </div>
                                    <div className="bg-pink-50 p-4 rounded-3xl">
                                        <div className="text-pink-300 text-xs font-black uppercase">Moves</div>
                                        <div className="text-pink-500 text-2xl font-black">{state.moves}</div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => restart()}
                                    className="mt-4 px-8 py-4 bg-pink-500 text-white font-black rounded-3xl shadow-lg hover:bg-pink-600 transition-all active:scale-95 flex items-center gap-2"
                                >
                                    <RotateCcw className="w-6 h-6" /> Play Again
                                </button>
                            </motion.div>

                            {/* Confetti particles - simplified for framer motion */}
                            {Array.from({ length: 20 }).map((_, i) => (
                                <motion.div
                                    key={i}
                                    initial={{
                                        x: Math.random() * window.innerWidth,
                                        y: window.innerHeight + 100,
                                        rotate: 0,
                                        scale: Math.random() + 0.5
                                    }}
                                    animate={{
                                        y: -100,
                                        rotate: 360,
                                        x: (Math.random() - 0.5) * 400 + (window.innerWidth / 2)
                                    }}
                                    transition={{
                                        duration: Math.random() * 2 + 2,
                                        repeat: Infinity,
                                        ease: "linear",
                                        delay: Math.random() * 3
                                    }}
                                    className={`fixed w-4 h-4 rounded-sm ${['bg-pink-300', 'bg-yellow-200', 'bg-blue-200', 'bg-purple-200'][i % 4]}`}
                                />
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Auto-complete (一括あがり) */}
                {canAutoComplete && (
                    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60]">
                        <button
                            onClick={autoComplete}
                            className="px-6 py-3 bg-pink-500 text-white font-black rounded-full shadow-lg shadow-pink-300 hover:bg-pink-600 transition-all active:scale-95 flex items-center gap-2 animate-pulse"
                        >
                            <Sparkles className="w-5 h-5" /> 一括あがり
                        </button>
                    </div>
                )}

                {/* Toast / Hint Message */}
                {!canAutoComplete && !state.hint && state.moves > 5 && (
                    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
                        <div className="bg-white/80 backdrop-blur-md border border-pink-100 px-4 py-2 rounded-full shadow-lg text-[10px] sm:text-xs text-pink-400 font-black uppercase tracking-widest flex items-center gap-2">
                            <MousePointer2 className="w-3 h-3" /> Double click to auto move
                        </div>
                    </div>
                )}

            </div>
        </DndContext>
    );
};

export default App;
