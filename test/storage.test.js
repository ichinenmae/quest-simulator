import test from "node:test";
import assert from "node:assert/strict";
import { defaultState, loadState, saveState, STORAGE_KEY } from "../src/storage.js";

function memoryStorage(initial={}) { const values=new Map(Object.entries(initial)); return { getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,value), values }; }

test("初期サービスを生成する", () => {
  assert.deepEqual(defaultState().services.map(item=>item.name),["Uber","出前館","ロケットナウ","menu"]);
});

test("保存と復元", () => {
  const storage=memoryStorage(); const state=defaultState(); state.settings.marginCount=8; saveState(state,storage);
  assert.equal(loadState(storage).state.settings.marginCount,8);
});

test("破損データを退避して復旧する", () => {
  const storage=memoryStorage({[STORAGE_KEY]:"broken"}); const result=loadState(storage);
  assert.equal(result.recovered,true);
  assert.equal(result.state.services.length,4);
  assert.ok([...storage.values.keys()].some(key=>key.startsWith(`${STORAGE_KEY}:corrupt:`)));
});
