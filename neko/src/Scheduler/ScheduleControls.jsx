import PropTypes from 'prop-types';
import { CalendarClock, Info } from 'lucide-react';
import { cronFor, describeCron, getAvailableTimeZones, getLocalTimeZone, parseCronSchedule } from './scheduleUtils';

export default function WorkflowScheduleControls({ value, onChange, timezone, onTimezoneChange, inputClassName = '' }) {
  const parsed = parseCronSchedule(value);
  const timeZone = timezone || getLocalTimeZone();
  const timeZones = getAvailableTimeZones();

  const changeFrequency = (frequency) => {
    onChange(cronFor({ ...parsed, frequency, current: value }));
  };

  const changeTime = (time) => {
    onChange(cronFor({ ...parsed, time, current: value }));
  };

  const changeWeekday = (weekday) => {
    onChange(cronFor({ ...parsed, weekday, current: value }));
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">Frequency</span>
          <select
            value={parsed.frequency}
            onChange={(event) => changeFrequency(event.target.value)}
            className={inputClassName}
          >
            <option value="hourly">Every hour</option>
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekly">Every week</option>
            <option value="custom">Advanced cron</option>
          </select>
        </label>

        {parsed.frequency !== 'hourly' && parsed.frequency !== 'custom' ? (
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">Time</span>
            <input type="time" value={parsed.time} onChange={(event) => changeTime(event.target.value)} className={inputClassName} />
          </label>
        ) : null}
      </div>

      {parsed.frequency === 'weekly' ? (
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">Day of week</span>
          <select value={parsed.weekday} onChange={(event) => changeWeekday(event.target.value)} className={inputClassName}>
            <option value="1">Monday</option>
            <option value="2">Tuesday</option>
            <option value="3">Wednesday</option>
            <option value="4">Thursday</option>
            <option value="5">Friday</option>
            <option value="6">Saturday</option>
            <option value="0">Sunday</option>
          </select>
        </label>
      ) : null}

      {parsed.frequency === 'custom' ? (
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">Cron expression</span>
          <input
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
            className={`${inputClassName} font-mono`}
            placeholder="0 9 * * *"
            spellCheck={false}
          />
        </label>
      ) : null}

      {onTimezoneChange ? (
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">Timezone</span>
          <select value={timeZone} onChange={(event) => onTimezoneChange(event.target.value)} className={inputClassName}>
            {timeZones.map(zone => <option key={zone} value={zone}>{zone === getLocalTimeZone() ? `${zone} (local)` : zone}</option>)}
          </select>
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-200/80 bg-white px-3 py-2 text-[11px] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 midnight:border-slate-800 midnight:bg-slate-900">
        <span className="inline-flex items-center gap-1.5 font-medium text-gray-600 dark:text-gray-300">
          <CalendarClock className="h-3.5 w-3.5" />
          {describeCron(value)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Info className="h-3 w-3" /> {timeZone}
        </span>
      </div>
    </div>
  );
}

WorkflowScheduleControls.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  timezone: PropTypes.string,
  onTimezoneChange: PropTypes.func,
  inputClassName: PropTypes.string,
};
