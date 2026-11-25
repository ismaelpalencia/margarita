import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isNotificationSoundType, NOTIFICATION_SOUND_TYPES } from "./notification-sound";

describe("tipo de sonido de notificación", () => {
    it("acepta la lista completa de sonidos disponibles", () => {
        assert.deepEqual(NOTIFICATION_SOUND_TYPES, ["classic", "gentle", "bell", "double", "chime", "drop", "marimba", "pulse"]);
        for (const sound of NOTIFICATION_SOUND_TYPES) assert.equal(isNotificationSoundType(sound), true);
    });

    it("rechaza sonidos desconocidos y valores que no son texto", () => {
        assert.equal(isNotificationSoundType("unknown"), false);
        assert.equal(isNotificationSoundType(null), false);
        assert.equal(isNotificationSoundType({}), false);
    });
});
