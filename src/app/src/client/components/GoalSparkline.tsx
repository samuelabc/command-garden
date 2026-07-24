import { useMemo } from 'react';
import { workingDayDates } from '../lib/goals';

interface GoalSparklineProps {
  month: string;
  today: string;
  dailyHours: Map<string, number>;
}

export function GoalSparkline({ month, today, dailyHours }: GoalSparklineProps) {
  const workingDays = useMemo(() => workingDayDates(month), [month]);

  const maxHours = useMemo(() => {
    let max = 0;
    for (const h of dailyHours.values()) {
      if (h > max) max = h;
    }
    return max || 8;
  }, [dailyHours]);

  const barWidth = 3;
  const gap = 1;
  const height = 20;
  const svgWidth = workingDays.length * (barWidth + gap) - gap;

  return (
    <svg
      width={svgWidth}
      height={height}
      viewBox={`0 0 ${svgWidth} ${height}`}
      className="block"
      role="img"
      aria-label="Daily hours sparkline"
    >
      {workingDays.map((date, i) => {
        const hours = dailyHours.get(date) ?? 0;
        const isPast = date <= today;
        const barHeight = hours > 0 ? Math.max(2, (hours / maxHours) * height) : 0;
        const x = i * (barWidth + gap);
        const y = height - barHeight;

        if (!isPast) {
          return (
            <rect
              key={date}
              x={x}
              y={height - 2}
              width={barWidth}
              height={2}
              className="fill-base-300"
            />
          );
        }

        if (barHeight === 0) {
          return (
            <rect
              key={date}
              x={x}
              y={height - 2}
              width={barWidth}
              height={2}
              className="fill-base-content/20"
            />
          );
        }

        return (
          <rect
            key={date}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            className={date === today ? 'fill-primary' : 'fill-base-content/50'}
          />
        );
      })}
    </svg>
  );
}
