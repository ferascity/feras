import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import {
  createDraftId,
  readAgentDrafts,
  writeAgentDrafts,
  type AgentDraft,
  type AgentPreset,
} from '../lib/storage';

const PRESETS: AgentPreset[] = ['Stockfish', 'Maia', 'Custom'];
const OPENINGS = [
  'Italian Game',
  'Sicilian Defense',
  'Ruy López',
  'Queen’s Gambit',
  "King's Indian",
  'No opening book',
];
const AGGRESSION_LABELS = ['Calm', 'Measured', 'Balanced', 'Sharp', 'Ruthless'];
const MAX_DRAFTS = 6;

const PIPELINE = [
  { title: 'Draft', detail: 'Name, engine, opening and temperament.' },
  { title: 'Dataset', detail: 'Generate training and evaluation games.' },
  { title: 'Fine-tune', detail: 'Run the Feras trainer on your draft.' },
  { title: 'Deploy', detail: 'Enter the arena and compete for the pool.' },
];

export function Train() {
  const [drafts, setDrafts] = useState<AgentDraft[]>(() => readAgentDrafts());
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<AgentPreset>('Stockfish');
  const [opening, setOpening] = useState(OPENINGS[0]);
  const [aggression, setAggression] = useState(3);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    writeAgentDrafts(drafts);
  }, [drafts]);

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();

    if (trimmed.length < 2) {
      setFormError('Give your agent a name of at least 2 characters.');
      return;
    }
    if (trimmed.length > 32) {
      setFormError('Keep the name to 32 characters or fewer.');
      return;
    }
    if (drafts.length >= MAX_DRAFTS) {
      setFormError(`You can keep ${MAX_DRAFTS} drafts at a time. Delete one first.`);
      return;
    }
    if (drafts.some((draft) => draft.name.toLowerCase() === trimmed.toLowerCase())) {
      setFormError('You already have a draft with that name.');
      return;
    }

    const draft: AgentDraft = {
      id: createDraftId(),
      name: trimmed,
      preset,
      opening,
      aggression,
      createdAt: new Date().toISOString(),
    };

    setDrafts((previous) => [draft, ...previous]);
    setName('');
    setFormError(null);
  };

  const handleDelete = (id: string) => {
    setDrafts((previous) => previous.filter((draft) => draft.id !== id));
  };

  return (
    <div className="page route-view">
      <div className="page-head">
        <div>
          <span className="eyebrow">Train · Agent lab</span>
          <h1>Shape your agent.</h1>
          <p className="lede">
            Draft an engine, choose its opening repertoire, and set its
            temperament. Training runs live in the Feras app.
          </p>
        </div>
        <div className="page-head-actions">
          <span className="chip">
            <Icon name="layers" size={12} />
            <span className="mono">
              {drafts.length} / {MAX_DRAFTS}
            </span>
            drafts
          </span>
        </div>
      </div>

      <div className="train-grid">
        <div>
          <div className="panel-head">
            <div>
              <div className="panel-title">Your drafts</div>
              <div className="panel-sub">
                Stored on this device. No training run is started from the web
                preview.
              </div>
            </div>
          </div>

          {drafts.length === 0 ? (
            <div className="card empty">
              <span className="empty-icon">
                <Icon name="sparkles" />
              </span>
              <h3>No drafts yet</h3>
              <p>
                Create your first agent with the form. You can keep up to six
                drafts and refine them later.
              </p>
            </div>
          ) : (
            <div className="agent-list">
              {drafts.map((draft, index) => (
                <div className="card card-hover agent-item" key={draft.id}>
                  <span className={`agent-avatar${index % 2 === 1 ? ' black' : ''}`}>
                    {draft.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="agent-item-body">
                    <div className="agent-item-top">
                      <span className="agent-item-name">{draft.name}</span>
                      <span className="badge soft">Draft</span>
                    </div>
                    <div className="agent-item-meta">
                      {draft.preset} · {draft.opening} · Aggression {draft.aggression}/5
                    </div>
                  </div>
                  <div className="agent-item-right">
                    <span className="agent-item-rating">
                      {new Date(draft.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleDelete(draft.id)}
                      aria-label={`Delete ${draft.name}`}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card rail-card train-pipeline">
            <div className="panel-head">
              <div>
                <div className="panel-title">Training pipeline</div>
                <div className="panel-sub">Planned for the app release</div>
              </div>
              <span className="badge demo">In progress</span>
            </div>

            <div className="pipeline">
              {PIPELINE.map((step, index) => (
                <div
                  className={`pipeline-step${index === 0 && drafts.length > 0 ? ' done' : ''}`}
                  key={step.title}
                >
                  <span className="pipeline-num">{index + 1}</span>
                  <div className="pipeline-body">
                    <strong>{step.title}</strong>
                    <span>{step.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card draft-card">
          <div className="panel-head">
            <div>
              <div className="panel-title">New draft</div>
              <div className="panel-sub">A starting point for a future run</div>
            </div>
            <span className="value-icon train-form-icon">
              <Icon name="cpu" />
            </span>
          </div>

          <form className="draft-form" onSubmit={handleCreate}>
            <div className="field">
              <label className="field-label" htmlFor="agent-name">
                Name
                <span>{name.trim().length}/32</span>
              </label>
              <input
                id="agent-name"
                className="input"
                value={name}
                maxLength={32}
                autoComplete="off"
                placeholder="e.g. Nightshade"
                onChange={(event) => {
                  setName(event.target.value);
                  if (formError) setFormError(null);
                }}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="agent-preset">
                Base engine
              </label>
              <select
                id="agent-preset"
                className="select"
                value={preset}
                onChange={(event) => setPreset(event.target.value as AgentPreset)}
              >
                {PRESETS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="agent-opening">
                Opening book
              </label>
              <select
                id="agent-opening"
                className="select"
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
              >
                {OPENINGS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="agent-aggression">
                Aggression
                <span>
                  {aggression} · {AGGRESSION_LABELS[aggression - 1]}
                </span>
              </label>
              <input
                id="agent-aggression"
                className="range"
                type="range"
                min={1}
                max={5}
                step={1}
                value={aggression}
                onChange={(event) => setAggression(Number(event.target.value))}
              />
              <div className="range-scale">
                <span>Positional</span>
                <span>Tactical</span>
              </div>
            </div>

            {formError ? (
              <div className="notice error">
                <Icon name="alert" />
                <span>{formError}</span>
              </div>
            ) : null}

            <button type="submit" className="btn btn-primary btn-block">
              <Icon name="plus" className="btn-icon" />
              Create draft
            </button>

            <p className="draft-note">
              <Icon name="info" />
              <span>
                Drafts are stored in this browser. Training runs and on-chain
                ownership arrive with the mobile app.
              </span>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
