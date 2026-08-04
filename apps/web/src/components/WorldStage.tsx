import {
  Apple,
  BrickWall,
  Eraser,
  Eye,
  Layers3,
  MousePointer2,
  Route,
  type LucideIcon,
} from "lucide-react";
import type {
  EntityId,
  InterventionTool,
  OverlaySettings,
  WorldAction,
  WorldView,
} from "../model";
import { PixiWorld } from "./PixiWorld";
import type { ReplayCameraTarget } from "./pixi/camera";
import { compactLabel, identityGlyph } from "./pixi/visual-grammar";
import { IconButton } from "./ui";

const toolOptions: Array<{
  id: InterventionTool;
  label: string;
  icon: LucideIcon;
  help: string;
}> = [
  {
    id: "inspect",
    label: "Inspect",
    icon: MousePointer2,
    help: "Select a creature, or drag the dish to pan.",
  },
  {
    id: "add-food",
    label: "Add food",
    icon: Apple,
    help: "Place food at a tile. Creatures decide whether to notice and use it.",
  },
  {
    id: "remove-food",
    label: "Remove food",
    icon: Eraser,
    help: "Remove food from a tile and record the intervention.",
  },
  {
    id: "obstacle",
    label: "Toggle obstacle",
    icon: BrickWall,
    help: "Open or close a tile. Existing routes will be reconsidered.",
  },
];

export function WorldStage({
  seed,
  view,
  selectedId,
  focusedId,
  followedId,
  tool,
  overlays,
  feedback,
  mutationDisabled = false,
  replayCamera = null,
  onTool,
  onOverlay,
  onSelect,
  onHover,
  onWorldAction,
}: {
  seed: number;
  view: WorldView;
  selectedId: EntityId | null;
  focusedId: EntityId | null;
  followedId: EntityId | null;
  tool: InterventionTool;
  overlays: OverlaySettings;
  feedback: string;
  mutationDisabled?: boolean;
  replayCamera?: ReplayCameraTarget | null;
  onTool: (tool: InterventionTool) => void;
  onOverlay: (overlay: keyof OverlaySettings) => void;
  onSelect: (id: EntityId | null) => void;
  onHover: (id: EntityId | null) => void;
  onWorldAction: (action: WorldAction) => void;
}) {
  const activeTool = toolOptions.find((option) => option.id === tool) ?? toolOptions[0]!;
  const ActiveToolIcon = activeTool.icon;
  const selectedCreature = view.creatures.find((creature) => creature.id === selectedId);
  const focusedCreature = view.creatures.find((creature) => creature.id === focusedId);
  const dishSubject = selectedCreature ?? focusedCreature;
  const subjectMode = selectedCreature ? "Selected" : "Focused";
  const subjectColor = dishSubject
    ? `#${(dishSubject.color > 0 ? dishSubject.color : 0x8ea66c)
        .toString(16)
        .padStart(6, "0")
        .slice(-6)}`
    : undefined;
  return (
    <section className="dish-stage" aria-labelledby="dish-heading">
      <div className="dish-toolbar">
        <div className="tool-group" aria-label="Dish tools">
          {toolOptions.map((option) => (
            <IconButton
              key={option.id}
              label={option.label}
              icon={option.icon}
              pressed={tool === option.id}
              disabled={
                replayCamera !== null || (mutationDisabled && option.id !== "inspect")
              }
              onClick={() => onTool(option.id)}
            >
              {option.label}
            </IconButton>
          ))}
        </div>
        <div className="overlay-group" aria-label="Map overlays">
          <IconButton
            label="Toggle resource emphasis"
            icon={Eye}
            pressed={overlays.resources}
            onClick={() => onOverlay("resources")}
          />
          <IconButton
            label="Toggle intention paths"
            icon={Route}
            pressed={overlays.intentions}
            onClick={() => onOverlay("intentions")}
          />
          <IconButton
            label="Toggle group influence"
            icon={Layers3}
            pressed={overlays.groups}
            onClick={() => onOverlay("groups")}
          />
        </div>
      </div>
      <div className="dish-heading">
        <div>
          <span className="eyebrow">
            {view.scenario.name} · seed {seed}
          </span>
          <h2 id="dish-heading">Living dish</h2>
        </div>
        <span className="dish-heading__instruction">
          <ActiveToolIcon aria-hidden="true" size={15} />
          {replayCamera
            ? "Replay framing is locked; return to the live world to pan or zoom."
            : mutationDisabled && tool !== "inspect"
              ? "Wait for the current experiment operation to finish."
              : activeTool.help}
        </span>
      </div>
      <div className="dish-well">
        <PixiWorld
          view={view}
          selectedId={selectedId}
          focusedId={focusedId}
          followedId={followedId}
          tool={tool}
          overlays={overlays}
          mutationDisabled={mutationDisabled}
          replayCamera={replayCamera}
          onSelect={onSelect}
          onHover={onHover}
          onWorldAction={onWorldAction}
        />
        {dishSubject ? (
          <aside
            className={`dish-subject-label dish-subject-label--${subjectMode.toLowerCase()}`}
            aria-label={`${subjectMode} creature: ${dishSubject.name}`}
          >
            <span
              className="dish-subject-label__identity"
              style={{ borderColor: subjectColor, color: subjectColor }}
              aria-hidden="true"
            >
              {identityGlyph(dishSubject.id)}
            </span>
            <span className="dish-subject-label__copy">
              <span className="eyebrow">{subjectMode} subject</span>
              <strong>{dishSubject.name}</strong>
              <span>
                {compactLabel(dishSubject.action)} · {compactLabel(dishSubject.actionPhase)}
              </span>
              <span className="dish-subject-label__desire">
                Wants {compactLabel(dishSubject.desire, 34).toLowerCase()}
              </span>
            </span>
          </aside>
        ) : null}
        <div className="dish-legend" aria-label="World legend">
          <span>
            <i className="legend-dot legend-dot--creature" /> creature
          </span>
          <span>
            <i className="legend-dot legend-dot--food" /> food
          </span>
          <span>
            <i className="legend-dot legend-dot--material" /> material
          </span>
          <span>
            <i className="legend-dot legend-dot--storage" /> storage
          </span>
        </div>
      </div>
      <div className="dish-caption">
        <span className="feedback-line" role="status" aria-live="polite">
          {feedback}
        </span>
        <span>
          {replayCamera
            ? "Replay camera locked · return live to restore your view"
            : "Wheel to zoom · drag to pan · Shift-drag with a tool"}
        </span>
      </div>
    </section>
  );
}
