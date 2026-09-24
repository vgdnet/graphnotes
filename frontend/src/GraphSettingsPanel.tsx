import { useState } from "react";
import type { ReactNode } from "react";
import { GRAPH_SETTINGS_DEFAULTS, createGraphGroup } from "./graphSettings";
import type { GraphGroup, GraphSettings } from "./graphSettings";

function patchSettings(settings: GraphSettings, partial: Partial<GraphSettings>): GraphSettings {
  return { ...settings, ...partial };
}

function updateGroup(groups: GraphGroup[], id: string, partial: Partial<GraphGroup>): GraphGroup[] {
  return groups.map((group) => (group.id === id ? { ...group, ...partial } : group));
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="graph-settings__switch">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function SliderRow({
  label,
  value,
  readout,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  readout: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="graph-settings__slider">
      {label}
      <span className="graph-settings__slider-row">
        <span className="graph-settings__readout">{readout}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </span>
    </label>
  );
}

function Fold({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="graph-settings__section">
      <button
        className="graph-settings__fold"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className={open ? "graph-settings__chevron is-open" : "graph-settings__chevron"} aria-hidden="true" />
        {title}
      </button>
      {open ? children : null}
    </div>
  );
}

export function GraphSettingsPanel({
  settings,
  onChange,
  open,
  onOpenChange,
  onRestartLayout,
}: {
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestartLayout?: () => void;
}) {
  const [folded, setFolded] = useState({
    filters: true,
    groups: true,
    display: true,
    forces: true,
  });

  function toggleFold(key: keyof typeof folded) {
    setFolded((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <>
      {!open && (
        <button
          className="graph-settings__toggle"
          type="button"
          aria-expanded={false}
          aria-controls="graph-settings-panel"
          title="Настройки графа"
          onClick={() => onOpenChange(true)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64L4.86 11.06c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"
            />
          </svg>
          <span className="visually-hidden">Настройки графа</span>
        </button>
      )}
      {open && (
        <section
          id="graph-settings-panel"
          className="graph-settings"
          aria-label="Настройки графа"
        >
          <div className="graph-settings__head">
            <h2 className="visually-hidden">Настройки графа</h2>
            <button
              className="graph-settings__icon"
              type="button"
              title="Сбросить настройки"
              aria-label="Сбросить настройки"
              onClick={() => onChange({ ...GRAPH_SETTINGS_DEFAULTS, groups: [] })}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 0 1-8.9 3.1L6.7 17.5A7 7 0 0 0 19 13c0-3.87-3.13-7-7-7Z"
                />
              </svg>
            </button>
            <button
              className="graph-settings__icon"
              type="button"
              title="Закрыть"
              aria-label="Закрыть настройки графа"
              onClick={() => onOpenChange(false)}
            >
              ×
            </button>
          </div>

          <Fold title="Фильтры" open={folded.filters} onToggle={() => toggleFold("filters")}>
            <SwitchRow
              label="Теги"
              checked={settings.showTags}
              onChange={(checked) => onChange(patchSettings(settings, { showTags: checked }))}
            />
            <SwitchRow
              label="Объекты без связей"
              checked={settings.showOrphans}
              onChange={(checked) => onChange(patchSettings(settings, { showOrphans: checked }))}
            />
          </Fold>

          <Fold title="Группировка" open={folded.groups} onToggle={() => toggleFold("groups")}>
            {settings.groups.map((group) => (
              <div className="graph-settings__group" key={group.id}>
                <input
                  type="search"
                  value={group.query}
                  placeholder="Поисковый запрос..."
                  aria-label="Поисковый запрос группы"
                  onChange={(event) => onChange(patchSettings(settings, {
                    groups: updateGroup(settings.groups, group.id, { query: event.target.value }),
                  }))}
                />
                <label className="graph-settings__swatch" style={{ background: group.color }}>
                  <input
                    type="color"
                    value={group.color}
                    aria-label="Цвет группы"
                    onChange={(event) => onChange(patchSettings(settings, {
                      groups: updateGroup(settings.groups, group.id, { color: event.target.value }),
                    }))}
                  />
                </label>
                <button
                  className="graph-settings__remove"
                  type="button"
                  aria-label="Удалить группу"
                  onClick={() => onChange(patchSettings(settings, {
                    groups: settings.groups.filter((item) => item.id !== group.id),
                  }))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="graph-settings__wide"
              type="button"
              onClick={() => onChange(patchSettings(settings, {
                groups: [...settings.groups, createGraphGroup(settings.groups.length)],
              }))}
            >
              Новая группа
            </button>
          </Fold>

          <Fold title="Отображение" open={folded.display} onToggle={() => toggleFold("display")}>
            <SwitchRow
              label="Направление связей"
              checked={settings.arrows}
              onChange={(checked) => onChange(patchSettings(settings, { arrows: checked }))}
            />
            <SliderRow
              label="Порог исчезания текста"
              value={settings.textFade}
              readout={(settings.textFade / 10).toFixed(2)}
              min={0}
              max={10}
              step={1}
              onChange={(textFade) => onChange(patchSettings(settings, { textFade }))}
            />
            <SliderRow
              label="Размер узла"
              value={settings.nodeSize}
              readout={settings.nodeSize.toFixed(2)}
              min={0.4}
              max={2.5}
              step={0.05}
              onChange={(nodeSize) => onChange(patchSettings(settings, { nodeSize }))}
            />
            <SliderRow
              label="Толщина линий"
              value={settings.linkThickness}
              readout={settings.linkThickness.toFixed(2)}
              min={0.4}
              max={3}
              step={0.05}
              onChange={(linkThickness) => onChange(patchSettings(settings, { linkThickness }))}
            />
            <SliderRow
              label="Скорость зума"
              value={settings.zoomSpeed}
              readout={`${settings.zoomSpeed.toFixed(1)}×`}
              min={1}
              max={4}
              step={0.5}
              onChange={(zoomSpeed) => onChange(patchSettings(settings, { zoomSpeed }))}
            />
            <button className="graph-settings__wide" type="button" onClick={() => onRestartLayout?.()}>
              Запустить анимацию
            </button>
          </Fold>

          <Fold title="Силы" open={folded.forces} onToggle={() => toggleFold("forces")}>
            <SliderRow
              label="Сила притяжения"
              value={settings.centerForce}
              readout={(settings.centerForce / 100).toFixed(2)}
              min={0}
              max={100}
              step={1}
              onChange={(centerForce) => onChange(patchSettings(settings, { centerForce }))}
            />
            <SliderRow
              label="Сила отталкивания"
              value={settings.repelForce}
              readout={(settings.repelForce / 10).toFixed(2)}
              min={0}
              max={100}
              step={1}
              onChange={(repelForce) => onChange(patchSettings(settings, { repelForce }))}
            />
            <SliderRow
              label="Сила связи"
              value={settings.linkForce}
              readout={(settings.linkForce / 100).toFixed(2)}
              min={0}
              max={100}
              step={1}
              onChange={(linkForce) => onChange(patchSettings(settings, { linkForce }))}
            />
            <SliderRow
              label="Расстояние между узлами"
              value={settings.linkDistance}
              readout={String(Math.round(20 + (settings.linkDistance / 100) * 180))}
              min={0}
              max={100}
              step={1}
              onChange={(linkDistance) => onChange(patchSettings(settings, { linkDistance }))}
            />
          </Fold>
        </section>
      )}
    </>
  );
}
