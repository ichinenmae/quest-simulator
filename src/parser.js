import { normalizeQuest, questValidation } from "./quest.js?v=20260615-12";

const META_KEYS = new Set(["QUEST_TYPE","SERVICE","TITLE","PERIOD","START_DATE","END_DATE","DAY","START","END"]);
const REPEAT_KEYS = new Set(["REPEAT_START","REPEAT_END","REPEAT_BONUS"]);
const TYPE_MAP = { PERIOD:"period", TIME:"time", WEATHER:"weather", DAILY:"daily", OTHER:"other" };

export function parseAIText(text, services) {
  const blocks = splitBlocks(text);
  if (!blocks.length) return { items: [], errors: ["解析するテキストがありません。"] };
  const items = blocks.map((block, blockIndex) => parseBlock(block, blockIndex, services));
  return { items, errors: [] };
}

function splitBlocks(text) {
  const blocks = [], current = [];
  String(text || "").split(/\r?\n/).forEach(raw => {
    const line = normalizeLine(raw);
    if (line.startsWith("#")) return;
    if (/^\s*---\s*$/.test(line)) {
      pushBlock(blocks, current);
      return;
    }
    if (/^QUEST_TYPE\s*:/i.test(line) && current.some(value => value.trim())) pushBlock(blocks, current);
    current.push(line);
  });
  pushBlock(blocks, current);
  return blocks;
}

function pushBlock(blocks, current) {
  const block = current.join("\n").trim();
  if (block) blocks.push(block);
  current.length = 0;
}

function parseBlock(block, blockIndex, services) {
  const meta = {}, milestones = [], unknownKeys = [], parseErrors = [], warnings = [];
  block.split(/\r?\n/).forEach((raw, lineIndex) => {
    const line = normalizeLine(raw);
    if (!line || line.startsWith("#")) return;
    const keyValue = line.match(/^([A-Z_]+)\s*:\s*(.*)$/);
    const repeat = line.match(/^(REPEAT_START|REPEAT_END|REPEAT_BONUS)\s*=\s*(.*)$/);
    const milestone = line.match(/^([\d,]+)\s*=\s*([\d,]+)$/);
    if (keyValue) {
      const [, key, value] = keyValue;
      if (!META_KEYS.has(key)) unknownKeys.push(key); else meta[key] = value.trim();
    } else if (repeat) meta[repeat[1]] = repeat[2].trim();
    else if (milestone) milestones.push({ count:Number(milestone[1].replaceAll(",","")), reward:Number(milestone[2].replaceAll(",","")) });
    else parseErrors.push(`${lineIndex + 1}行目を解釈できません。`);
  });
  unknownKeys.forEach(key => warnings.push(`不明なキー: ${key}`));
  Object.entries(meta).forEach(([key,value]) => { if (value === "UNKNOWN") warnings.push(`${key}がUNKNOWNです。`); });
  if (!TYPE_MAP[meta.QUEST_TYPE]) parseErrors.push("QUEST_TYPEが不明です。");
  const raw = { questType:TYPE_MAP[meta.QUEST_TYPE] || "unknown", service:meta.SERVICE, title:meta.TITLE, period:meta.PERIOD, startDate:meta.START_DATE, endDate:meta.END_DATE, day:meta.DAY, start:meta.START, end:meta.END, milestones, repeatStart:toNumber(meta.REPEAT_START), repeatEnd:toNumber(meta.REPEAT_END), repeatBonus:toNumber(meta.REPEAT_BONUS) };
  const quest = normalizeQuest(raw, services);
  if (meta.SERVICE === "UNKNOWN") quest.serviceId = "";
  ["startDate","endDate","startTime","endTime"].forEach(key => { if (quest[key] === "UNKNOWN") quest[key] = null; });
  const validation = questValidation(quest, services);
  return { index:blockIndex, quest, errors:[...parseErrors,...validation.errors], warnings:[...warnings,...validation.warnings] };
}

function normalizeLine(raw) {
  const line = String(raw || "").trim();
  const stripped = line.replace(/^#{1,6}\s*/, "").trim();
  if (stripped !== line && (/^([A-Z_]+)\s*:/i.test(stripped) || /^(REPEAT_START|REPEAT_END|REPEAT_BONUS)\s*=/.test(stripped) || /^[\d,]+\s*=\s*[\d,]+$/.test(stripped))) return stripped;
  return line;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  if (["UNLIMITED","NONE","上限なし"].includes(String(value).trim().toUpperCase())) return null;
  return Number(String(value).replaceAll(",",""));
}
