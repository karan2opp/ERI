import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Long text shown as its first few lines with "Show more". The button only appears when the text
 * is actually cut off; "Show less" folds it back. Line breaks in the text are kept.
 */
export const ExpandableText: React.FC<{ text: string; lines?: 3 | 4 | 5 | 6; className?: string }> = ({ text, lines = 4, className }) => {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  // Check whether the clamped text is cut off (re-checked when the text or width changes)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (!expanded) setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  const clamp = { 3: 'line-clamp-3', 4: 'line-clamp-4', 5: 'line-clamp-5', 6: 'line-clamp-6' }[lines];

  return (
    <div className={className}>
      <p ref={ref} className={cn('leading-relaxed whitespace-pre-wrap', !expanded && clamp)}>
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded-md font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? 'Show less' : 'Show more'}
          <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
