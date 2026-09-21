import { GRAPH_SETTINGS_DEFAULTS, createGraphGroup } from "./graphSettings";
import type { GraphGroup, GraphSettings } from "./graphSettings";

function patchSettings(settings: GraphSettings, partial: Partial<GraphSettings>): GraphSettings {
  return { ...settings, ...partial };
}

function updateGroup(groups: GraphGroup[], id: string, partial: Partial<GraphGroup>): GraphGroup[] {
  return groups.map((group) => (group.id === id ? { ...group, ...partial } : group));
}

export function GraphSettingsPanel({
  settings,
  onChange,
  open,
  onOpenChange,
}: {
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <button
        className="graph-settings__toggle"
        type="button"
        aria-expanded={open}
        aria-controls="graph-settings-panel"
        title="Настройки графа"
        onClick={() => onOpenChange(!open)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64L4.86 11.06c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"
          />
        </svg>
        <span className="visually-hidden">Настройки графа</span>
      </button>
      {open && (
        <section
          id="graph-settings-panel"
          className="graph-settings"
          aria-label="Настройки графа"
        >
          <h2>Настройки графа</h2>

          <div className="graph-settings__section">
            <h3>Фильтры</h3>
            <label className="graph-settings__check">
              <input
                type="checkbox"
                checked={settings.showTags}
                onChange={(event) => onChange(patchSettings(settings, { showTags: event.target.checked }))}
              />
              Теги
            </label>
            <label className="graph-settings__check">
              <input
                type="checkbox"
                checked={settings.showOrphans}
                onChange={(event) => onChange(patchSettings(settings, { showOrphans: event.target.checked }))}
              />
              Объекты без связей
            </label>
          </div>

          <div className="graph-settings__section">
            <h3>Группировка</h3>
            {settings.groups.map((group) => (
              <div className="graph-settings__group" key={group.id}>
                <input
                  type="search"
                  value={group.query}
                  placeholder="поисковый запрос"
                  aria-label="Поисковый запрос группы"
                  onChange={(event) => onChange(patchSettings(settings, {
                    groups: updateGroup(settings.groups, group.id, { query: event.target.value }),
                  }))}
                />
                <input
                  type="color"
                  value={group.color}
                  aria-label="Цвет группы"
                  onChange={(event) => onChange(patchSettings(settings, {
                    groups: updateGroup(settings.groups, group.id, { color: event.target.value }),
                  }))}
                />
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
              className="button button--quiet graph-settings__add"
              type="button"
              onClick={() => onChange(patchSettings(settings, {
                groups: [...settings.groups, createGraphGroup(settings.groups.length)],
              }))}
            >
              Новая группа
            </button>
          </div>

          <div className="graph-settings__section">
            <h3>Отображение</h3>
            <label className="graph-settings__check">
              <input
                type="checkbox"
                checked={settings.arrows}
                onChange={(event) => onChange(patchSettings(settings, { arrows: event.target.checked }))}
              />
              Направление связей
            </label>
            <label className="graph-settings__slider">
              Порог исчезания текста
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={settings.textFade}
                onChange={(event) => onChange(patchSettings(settings, { textFade: Number(event.target.value) }))}
              />
            </label>
            <label className="graph-settings__slider">
              Размер узла
              <input
                type="range"
                min={0.4}
                max={2.5}
                step={0.05}
                value={settings.nodeSize}
                onChange={(event) => onChange(patchSettings(settings, { nodeSize: Number(event.target.value) }))}
              />
            </label>
            <label className="graph-settings__slider">
              Толщина линий
              <input
                type="range"
                min={0.4}
                max={3}
                step={0.05}
                value={settings.linkThickness}
                onChange={(event) => onChange(patchSettings(settings, { linkThickness: Number(event.target.value) }))}
              />
            </label>
          </div>

          <div className="graph-settings__section">
            <h3>Силы</h3>
            <label className="graph-settings__slider">
              Сила притяжения
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={settings.centerForce}
                onChange={(event) => onChange(patchSettings(settings, { centerForce: Number(event.target.value) }))}
              />
            </label>
            <label className="graph-settings__slider">
              Сила отталкивания
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={settings.repelForce}
                onChange={(event) => onChange(patchSettings(settings, { repelForce: Number(event.target.value) }))}
              />
            </label>
            <label className="graph-settings__slider">
              Сила связи
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={settings.linkForce}
                onChange={(event) => onChange(patchSettings(settings, { linkForce: Number(event.target.value) }))}
              />
            </label>
            <label className="graph-settings__slider">
              Расстояние между узлами
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={settings.linkDistance}
                onChange={(event) => onChange(patchSettings(settings, { linkDistance: Number(event.target.value) }))}
              />
            </label>
          </div>

          <button
            className="button button--quiet"
            type="button"
            onClick={() => onChange({ ...GRAPH_SETTINGS_DEFAULTS, groups: [] })}
          >
            Сбросить настройки
          </button>
        </section>
      )}
    </>
  );
}
