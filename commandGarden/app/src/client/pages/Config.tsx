import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { Spinner } from '../components/Spinner';

export default function Config() {
  const [config, setConfig] = useState<Record<string, Record<string, unknown>>>({});
  const [edited, setEdited] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    api.getConfig()
      .then((d) => { setConfig(d.config); setEdited(structuredClone(d.config)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = useCallback((section: string, key: string, value: string) => {
    setEdited((prev) => {
      const next = structuredClone(prev);
      if (!next[section]) next[section] = {};
      next[section][key] = value;
      return next;
    });
  }, []);

  const handleArrayRemove = useCallback((section: string, key: string, index: number) => {
    setEdited((prev) => {
      const next = structuredClone(prev);
      const arr = next[section]?.[key];
      if (Array.isArray(arr)) arr.splice(index, 1);
      return next;
    });
  }, []);

  const handleArrayAdd = useCallback((section: string, key: string) => {
    const value = prompt(`Add value to ${section}.${key}:`);
    if (!value) return;
    setEdited((prev) => {
      const next = structuredClone(prev);
      if (!next[section]) next[section] = {};
      const arr = next[section][key];
      if (Array.isArray(arr)) arr.push(value);
      else next[section][key] = [value];
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setToast(null);
    try {
      for (const section of Object.keys(edited)) {
        for (const key of Object.keys(edited[section])) {
          const newVal = JSON.stringify(edited[section][key]);
          const oldVal = JSON.stringify(config[section]?.[key] ?? null);
          if (newVal !== oldVal) {
            const val = edited[section][key];
            const strVal = Array.isArray(val) ? JSON.stringify(val) : String(val);
            await api.setConfig(`${section}.${key}`, strVal);
          }
        }
      }
      setConfig(structuredClone(edited));
      setToast({ type: 'success', msg: 'Configuration saved.' });
    } catch (e) {
      setToast({ type: 'error', msg: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, [config, edited]);

  if (loading) return <Spinner label="Loading configuration..." />;

  const sections = Object.keys(edited);

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold mb-6">Configuration</h2>

      {sections.length === 0 ? (
        <p className="text-sm opacity-50">No configuration found. The daemon may not be running.</p>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section} className="bg-base-200 rounded-lg p-5">
              <h3 className="font-semibold mb-4 capitalize">{section}</h3>
              <div className="space-y-3">
                {Object.entries(edited[section]).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-3">
                    <label className="text-sm font-mono w-48 pt-2 shrink-0">{key}</label>
                    {Array.isArray(value) ? (
                      <div className="flex-1">
                        <div className="flex flex-wrap gap-1 mb-1">
                          {value.map((item, i) => (
                            <span key={i} className="badge badge-sm gap-1">
                              {String(item)}
                              <button className="text-xs opacity-50 hover:opacity-100" onClick={() => handleArrayRemove(section, key, i)}>&times;</button>
                            </span>
                          ))}
                        </div>
                        <button className="btn btn-xs btn-ghost" onClick={() => handleArrayAdd(section, key)}>+ Add</button>
                      </div>
                    ) : (
                      <input
                        type={typeof value === 'number' ? 'number' : 'text'}
                        className="input input-bordered input-sm flex-1"
                        value={String(value ?? '')}
                        onChange={(e) => handleChange(section, key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {toast && (
          <span className={`text-sm ${toast.type === 'success' ? 'text-success' : 'text-error'}`}>
            {toast.msg}
          </span>
        )}
      </div>
    </div>
  );
}
