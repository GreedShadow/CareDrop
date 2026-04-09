import { AUTH_SESSION_KEY, AUTH_SESSION_MAX_AGE_MS } from "./constants";
import { loadAuthSession } from "./app-utils";

describe("loadAuthSession", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null for expired auth sessions", () => {
    window.localStorage.setItem(
      AUTH_SESSION_KEY,
      JSON.stringify({
        id: "u1",
        name: "Test",
        lastAuthenticatedAt: Date.now() - AUTH_SESSION_MAX_AGE_MS - 1000,
      })
    );

    expect(loadAuthSession()).toBeNull();
  });

  it("returns active auth sessions", () => {
    window.localStorage.setItem(
      AUTH_SESSION_KEY,
      JSON.stringify({
        id: "u1",
        name: "Test",
        lastAuthenticatedAt: Date.now(),
      })
    );

    expect(loadAuthSession()).toEqual(expect.objectContaining({ id: "u1", name: "Test" }));
  });
});
