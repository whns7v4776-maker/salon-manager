import React from 'react';

// Presentation only: Agenda retains the suggestion, assignment and click logic.
export function QuickSlotWebFitContent({
  rank, startTime, endTime, operatorLabel, professionLabel, split, selected,
}: {
  rank: string;
  startTime: string;
  endTime: string;
  operatorLabel: string;
  professionLabel: string;
  split: boolean;
  selected: boolean;
}) {
  const names = operatorLabel.split(' + ').filter(Boolean);
  return (
    <div className="slot-fit-content" data-slot-fit-content data-selected={selected}>
      <div className="slot-fit-heading">
        <span className="slot-fit-rank" data-rank={rank}>{rank}</span>
        {selected ? <span className="slot-fit-check">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="m4.5 10 3.6 3.7 7.4-7.4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Scelto
        </span> : null}
      </div>
      <div className="slot-fit-time">
        <span>{startTime}</span><span className="slot-fit-time-dash">–</span><span>{endTime}</span>
      </div>
      <div className="slot-fit-footer">
      <div className="slot-fit-person">
        <span className="slot-fit-avatars" aria-hidden="true">{names.slice(0, 2).map((name, index) => <span className="slot-fit-avatar" key={index}>{name.trim().charAt(0).toUpperCase()}</span>)}</span>
        <div className="slot-fit-person-copy">
          <span className="slot-fit-name" title={operatorLabel}>{operatorLabel}</span>
          <span className="slot-fit-detail" title={professionLabel}>{professionLabel}</span>
        </div>
      </div>
      <span className="slot-fit-team-badge">{split ? "Più operatori" : "Unico operatore"}</span>
      </div>
    </div>
  );
}
