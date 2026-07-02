import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface DroppablePileProps {
    id: string;
    type: 'tableau' | 'foundation';
    index: number;
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export const DroppablePile: React.FC<DroppablePileProps> = ({
    id,
    type,
    index,
    children,
    className,
    style
}) => {
    const { setNodeRef, isOver } = useDroppable({
        id,
        data: {
            type,
            index,
        }
    });

    return (
        <div
            ref={setNodeRef}
            className={`
        relative rounded-xl border-2 transition-all duration-200
        ${isOver ? 'border-pink-400 bg-pink-100/50' : 'border-pink-200/30 bg-white/10'}
        ${className}
      `}
            style={style}
        >
            {children}
        </div>
    );
};
