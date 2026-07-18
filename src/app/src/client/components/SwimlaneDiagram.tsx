export interface Lane { id: string; label: string; color: string }
export interface ArrowStep { type: 'arrow'; from: string; to: string; label: string }
export interface ActionStep { type: 'action'; lane: string; label: string }
export type FlowStep = ArrowStep | ActionStep;
export interface FlowDef { title: string; lanes: Lane[]; steps: FlowStep[] }

export const LANE_HEADER: Record<string, string> = {
  client: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  daemon: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  extension: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  browser: 'border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-400',
};

export const LANE_LINE: Record<string, string> = {
  client: 'bg-sky-400/20',
  daemon: 'bg-amber-400/20',
  extension: 'bg-emerald-400/20',
  browser: 'bg-violet-400/20',
};

export function SwimlaneDiagram({ flow }: { flow: FlowDef }) {
  const { lanes, steps, title } = flow;
  const n = lanes.length;
  const colTpl = `repeat(${n}, 1fr)`;

  return (
    <div className="border border-base-300 p-4 overflow-x-auto">
      <h4 className="font-semibold text-sm mb-3">{title}</h4>
      <div style={{ minWidth: n * 130 }}>
        {/* Lane headers */}
        <div className="grid" style={{ gridTemplateColumns: colTpl }}>
          {lanes.map((l) => (
            <div key={l.id} className="flex justify-center">
              <span className={`px-2 py-1 text-[0.65rem] font-mono font-semibold border ${LANE_HEADER[l.color]}`}>
                {l.label}
              </span>
            </div>
          ))}
        </div>

        {/* Diagram body */}
        <div className="relative py-1">
          {/* Vertical lane lines */}
          <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: colTpl }}>
            {lanes.map((l) => (
              <div key={l.id} className="flex justify-center">
                <div className={`w-0.5 h-full ${LANE_LINE[l.color]}`} />
              </div>
            ))}
          </div>

          {/* Steps */}
          <div className="relative">
            {steps.map((step, i) => {
              if (step.type === 'action') {
                const laneIdx = lanes.findIndex((l) => l.id === step.lane);
                const center = ((laneIdx + 0.5) / n) * 100;
                return (
                  <div key={i} className="relative" style={{ height: 26 }}>
                    <div
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
                      style={{ left: `${center}%` }}
                    >
                      <span className="block px-2 py-0.5 text-[0.6rem] font-mono bg-base-200/90 border border-base-300/60 text-base-content/60 whitespace-nowrap">
                        {step.label}
                      </span>
                    </div>
                  </div>
                );
              }

              const fromIdx = lanes.findIndex((l) => l.id === step.from);
              const toIdx = lanes.findIndex((l) => l.id === step.to);
              const fromCenter = ((fromIdx + 0.5) / n) * 100;
              const toCenter = ((toIdx + 0.5) / n) * 100;
              const leftPct = Math.min(fromCenter, toCenter);
              const widthPct = Math.abs(toCenter - fromCenter);
              const goesRight = fromIdx < toIdx;

              return (
                <div key={i} className="relative" style={{ height: 30 }}>
                  {/* Line */}
                  <div
                    className="absolute top-1/2 h-px bg-base-content/20"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                  {/* Source dot */}
                  <div
                    className="absolute top-1/2 w-1.5 h-1.5 rounded-full bg-base-content/30 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${fromCenter}%` }}
                  />
                  {/* Arrowhead */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 text-[0.55rem] leading-none text-base-content/40"
                    style={{
                      left: `${toCenter}%`,
                      transform: `translate(${goesRight ? '-100%' : '0'}, -50%)`,
                    }}
                  >
                    {goesRight ? '▸' : '◂'}
                  </div>
                  {/* Label */}
                  <div
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
                    style={{ left: `${(fromCenter + toCenter) / 2}%` }}
                  >
                    <span className="px-1.5 py-px text-[0.6rem] font-mono bg-base-100 text-base-content/60 whitespace-nowrap">
                      {step.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
