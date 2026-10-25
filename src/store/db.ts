import { db } from "../db/index.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { 
  roles, colleagues, organizations, collections, contents, leaves, audit_logs, 
  recycle_bin, batch_operations, notifications, tokens, templatesData, 
  contentTemplates, templateSuggestions, expenses, invoices, mediaAssets, 
  smartEventsBank, clientSelections 
} from "./state.js";
import { settings } from "./state.js";

let saveTimeout: NodeJS.Timeout | null = null;
export let localDbTimestamp = 0;

export async function saveDatabase() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const data = {
        roles,
        colleagues,
        organizations,
        contents,
        settings,
        leaves,
        audit_logs,
        notifications,
        tokens,
        templatesData,
        expenses,
        invoices,
        mediaAssets,
        contentTemplates,
        templateSuggestions,
        collections,
        smartEventsBank,
        clientSelections,
        recycle_bin,
        batch_operations,
      };
      const cleanData = JSON.parse(JSON.stringify(data));
      const dataString = JSON.stringify(cleanData);
      const CHUNK_SIZE = 900000;
      const chunksCount = Math.ceil(dataString.length / CHUNK_SIZE);
      
      for (let i = 0; i < chunksCount; i++) {
        const chunkData = dataString.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await setDoc(doc(db, "database", `main_chunk_${i}`), {
          data: chunkData,
        });
      }
      await setDoc(doc(db, "database", "main_meta"), {
        chunks: chunksCount,
        timestamp: Date.now(),
      });
      localDbTimestamp = Date.now();
    } catch (e) {
      console.error("Error saving DB to Firebase:", e);
    }
  }, 1000);
}

export async function loadDatabase() {
  try {
    const metaDoc = await getDoc(doc(db, "database", "main_meta"));
    if (metaDoc.exists()) {
      const chunksCount = metaDoc.data().chunks;
      let fullDataString = "";
      for (let i = 0; i < chunksCount; i++) {
        const chunkDoc = await getDoc(doc(db, "database", `main_chunk_${i}`));
        if (chunkDoc.exists()) {
          fullDataString += chunkDoc.data().data;
        }
      }
      const data = JSON.parse(fullDataString);
      
      // Load state
      if (data.roles) { roles.length = 0; roles.push(...data.roles); }
      if (data.colleagues) { colleagues.length = 0; colleagues.push(...data.colleagues); }
      if (data.organizations) { organizations.length = 0; organizations.push(...data.organizations); }
      if (data.collections) { collections.length = 0; collections.push(...data.collections); }
      if (data.contents) { contents.length = 0; contents.push(...data.contents); }
      if (data.settings) { Object.assign(settings, data.settings); }
      if (data.leaves) { leaves.length = 0; leaves.push(...data.leaves); }
      if (data.audit_logs) { audit_logs.length = 0; audit_logs.push(...data.audit_logs); }
      if (data.recycle_bin) { recycle_bin.length = 0; recycle_bin.push(...data.recycle_bin); }
      if (data.batch_operations) { batch_operations.length = 0; batch_operations.push(...data.batch_operations); }
      if (data.notifications) { notifications.length = 0; notifications.push(...data.notifications); }
      if (data.tokens) { tokens.length = 0; tokens.push(...data.tokens); }
      if (data.templatesData) { templatesData.length = 0; templatesData.push(...data.templatesData); }
      if (data.contentTemplates) { contentTemplates.length = 0; contentTemplates.push(...data.contentTemplates); }
      if (data.templateSuggestions) { templateSuggestions.length = 0; templateSuggestions.push(...data.templateSuggestions); }
      if (data.expenses) { expenses.length = 0; expenses.push(...data.expenses); }
      if (data.invoices) { invoices.length = 0; invoices.push(...data.invoices); }
      if (data.mediaAssets) { mediaAssets.length = 0; mediaAssets.push(...data.mediaAssets); }
      if (data.smartEventsBank) { smartEventsBank.length = 0; smartEventsBank.push(...data.smartEventsBank); }
      if (data.clientSelections) { clientSelections.length = 0; clientSelections.push(...data.clientSelections); }

      localDbTimestamp = metaDoc.data().timestamp || 0;
      console.log("Database fully loaded from chunks");
    } else {
      console.log("No main_meta document found. Initializing empty arrays.");
    }
  } catch (error) {
    console.error("Error loading initial data from database chunks", error);
  }
}
