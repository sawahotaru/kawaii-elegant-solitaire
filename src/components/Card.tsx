import React from 'react';
import { motion } from 'framer-motion';
import { useDraggable } from '@dnd-kit/core';
import { Card as CardType } from '../types/game';

interface CardProps {
    card: CardType;
    isHinted?: boolean;
    isBeingDragged?: boolean;
    isOverlay?: boolean;
    onDoubleClick?: () => void;
    onClick?: () => void;
    style?: React.CSSProperties;
    className?: string;
    sourceType?: string;
    sourceIndex?: number;
}

export const Card: React.FC<CardProps> = ({
    card,
    isHinted,
    isBeingDragged,
    isOverlay,
    onDoubleClick,
    onClick,
    style,
    className,
    sourceType,
    sourceIndex
}) => {
    // Use stable card.id for draggable, but distinct for overlay to avoid collisions.
    const draggableId = isOverlay ? `${card.id}-overlay` : card.id;

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: draggableId,
        disabled: !card.isFaceUp || isOverlay,
        data: {
            card,
            sourceType,
            sourceIndex,
        }
    });

    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    const suitSymbols: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
    const rankLabels: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

    // Use style transform instead of layoutId during drag to avoid conflicts
    const dndStyle = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 1000,
    } : undefined;

    // Spring animation for smooth movement
    const springTransition = {
        type: "spring",
        stiffness: 400,
        damping: 30
    };

    if (!card.isFaceUp) {
        return (
            <motion.div
                transition={springTransition}
                onClick={onClick}
                className={`w-11 sm:w-20 h-20 sm:h-28 rounded-xl border-2 border-white shadow-md cursor-pointer bg-gradient-to-br from-pink-200 to-lavender-200 relative overflow-hidden ${className}`}
                style={{ ...style, ...dndStyle }}
            >
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_white_1px,_transparent_1px)] bg-[size:10px_10px]" />
            </motion.div>
        );
    }

    return (
        <motion.div
            ref={setNodeRef}
            transition={springTransition}
            {...listeners}
            {...attributes}
            onDoubleClick={onDoubleClick}
            onClick={onClick}
            className={`
        w-11 sm:w-20 h-20 sm:h-28 rounded-xl border-[1px] border-gray-100 shadow-md cursor-grab active:cursor-grabbing
        bg-white/90 backdrop-blur-sm flex flex-col items-center justify-between p-1 sm:p-2
        ${isRed ? 'text-pink-500' : 'text-gray-700'}
        ${isHinted ? 'ring-4 ring-yellow-300 ring-opacity-70 animate-pulse' : ''}
                ${isDragging || isBeingDragged ? 'opacity-0' : 'opacity-100'} 
                transition-shadow hover:shadow-lg
                ${className}
            `}
            style={{
                ...style,
                ...dndStyle,
                touchAction: 'none',
                pointerEvents: isDragging || isBeingDragged ? 'none' : 'auto'
            }}
        >
            {/* Subtle background texture */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIi8+CjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiIG9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')]"></div>

            <div className="w-full flex justify-between items-start z-10">
                <span className="text-xs sm:text-lg font-bold leading-none font-sans">{rankLabels[card.rank] || card.rank}</span>
                <span className="text-[10px] sm:text-sm">{suitSymbols[card.suit]}</span>
            </div>

            <div className="text-2xl sm:text-4xl filter drop-shadow-sm select-none z-10">
                {suitSymbols[card.suit]}
            </div>

            <div className="w-full flex justify-between items-end rotate-180 z-10">
                <span className="text-xs sm:text-lg font-bold leading-none font-sans">{rankLabels[card.rank] || card.rank}</span>
                <span className="text-[10px] sm:text-sm">{suitSymbols[card.suit]}</span>
            </div>
        </motion.div>
    );
};
