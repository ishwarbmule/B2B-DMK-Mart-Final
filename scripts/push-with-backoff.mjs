/** Push with backoff — GitHub push over flaky sandbox network. */
import { execSync } from "child_process";
const delays = [0, 20000, 45000];
for (let i = 0; i < delays.length; i++) {
  if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
  try {
    const out = execSync("git push origin main 2>&1", { cwd: "/home/z/my-project", encoding: "utf8", timeout: 180000 });
    console.log(out);
    console.log("PUSH OK");
    process.exit(0);
  } catch (e) {
    console.log(`attempt ${i + 1} failed: ${String(e.stdout || e.message).slice(-300)}`);
  }
}
console.log("PUSH FAILED after retries");
process.exit(1);
