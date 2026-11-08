import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Storage } from "../src/main/storage";

describe("Video-Speicher und Streaming", () => {
  it("übernimmt ein Video und liefert Teilstücke zum Spulen", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vjlink-"));
    const src = path.join(dir, "clip.mp4");
    writeFileSync(src, Buffer.alloc(5000, 7)); // Inhalt egal: der Speicher prüft nur Endung und Größe
    const st = new Storage(path.join(dir, "data"));
    await st.init();
    expect(await st.addVideo("relativ.mp4", "x")).toBe("Datei nicht gefunden.");
    expect(await st.addVideo(path.join(dir, "fehlt.txt"), "x")).toBe("Nur MP4, MOV, M4V oder WebM.");
    const r = await st.addVideo(src, "Clip");
    if (typeof r === "string") throw new Error(r);
    const size = statSync(src).size;
    const full = await st.serveVideo(new Request(`vjmedia://video/${r.id}.mp4`));
    expect(full.status).toBe(200);
    expect(full.headers.get("access-control-allow-origin")).toBe("*");
    expect((await full.arrayBuffer()).byteLength).toBe(size);
    const part = await st.serveVideo(new Request(`vjmedia://video/${r.id}`, { headers: { range: "bytes=100-199" } }));
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 100-199/${size}`);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
    expect((await st.serveVideo(new Request("vjmedia://video/../../etc"))).status).toBe(404);
    // nach Neustart bekannt
    const st2 = new Storage(path.join(dir, "data")); await st2.init();
    expect(st2.hasVideo(r.id)).toBe(true);
    expect(await st2.removeVideo(r.id)).toBe(true);
    expect((await st2.serveVideo(new Request(`vjmedia://video/${r.id}`))).status).toBe(404);
  });
});
