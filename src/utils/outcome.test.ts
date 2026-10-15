import assert from "node:assert/strict";
import test from "node:test";

import { ContactOutcomeType } from "@prisma/client";

import {
    classifyPromises,
    daysOverdue,
    isOverdue,
    parseAmount,
    parseDueDate
} from "./outcome";

const TZ = "America/Mexico_City";

function day(value: string) {
    return parseDueDate(value, TZ) as Date;
}

test("el atraso se cuenta en días completos y no marca el día del compromiso", () => {
    const today = day("2026-10-16");

    assert.equal(daysOverdue(day("2026-10-16"), today), 0, "vence hoy");
    assert.equal(daysOverdue(day("2026-10-17"), today), 0, "vence mañana");
    assert.equal(daysOverdue(day("2026-10-15"), today), 1, "venció ayer");
    assert.equal(daysOverdue(day("2026-10-01"), today), 15);
    assert.equal(daysOverdue(null, today), 0);
});

test("una promesa vencida se deduce, no se guarda", () => {
    const today = day("2026-10-16");

    assert.equal(
        isOverdue(ContactOutcomeType.PROMISE, day("2026-10-10"), today),
        true
    );
    assert.equal(
        isOverdue(ContactOutcomeType.CONVENIO, day("2026-10-10"), today),
        true
    );
    assert.equal(
        isOverdue(ContactOutcomeType.PROMISE, day("2026-10-20"), today),
        false
    );

    /** Un pago ya cerrado no puede estar vencido. */
    assert.equal(
        isOverdue(ContactOutcomeType.PAID, day("2026-10-10"), today),
        false
    );
    assert.equal(isOverdue(null, null, today), false);
});

test("lee montos escritos como los escribe la gente", () => {
    assert.equal(parseAmount("1250"), 1250);
    assert.equal(parseAmount("1,250.50"), 1250.5);
    assert.equal(parseAmount("$1,250.00"), 1250);
    assert.equal(parseAmount(" 2,000 "), 2000);
    assert.equal(parseAmount(""), null);
    assert.equal(parseAmount(null), null);
    assert.equal(parseAmount("sin monto"), null);
});

test("la fecha compromiso se guarda a medianoche local", () => {
    const parsed = parseDueDate("2026-10-16", TZ);

    assert.equal(parsed?.toISOString(), "2026-10-16T06:00:00.000Z");
    assert.equal(parseDueDate("", TZ), null);
    assert.equal(parseDueDate("no es fecha", TZ), null);
});

test("clasifica las promesas contra los pagos: a tiempo, tarde y sin pago", () => {
    const summary = classifyPromises(
        [
            {
                id: "p1",
                contactId: "c1",
                type: ContactOutcomeType.PROMISE,
                amount: 1000,
                dueAt: day("2026-10-16"),
                createdAt: day("2026-10-10")
            },
            {
                id: "p2",
                contactId: "c2",
                type: ContactOutcomeType.PROMISE,
                amount: 2000,
                dueAt: day("2026-10-10"),
                createdAt: day("2026-10-05")
            },
            {
                id: "p3",
                contactId: "c3",
                type: ContactOutcomeType.PROMISE,
                amount: 500,
                dueAt: day("2026-10-20"),
                createdAt: day("2026-10-12")
            }
        ],
        [
            /** c1 pagó el mismo día del compromiso. */
            {
                contactId: "c1",
                amount: 1000,
                paidAt: day("2026-10-16"),
                createdAt: day("2026-10-16")
            },
            /** c2 pagó tres días después. */
            {
                contactId: "c2",
                amount: 2000,
                paidAt: day("2026-10-13"),
                createdAt: day("2026-10-13")
            }
        ]
    );

    assert.equal(summary.onTime, 1);
    assert.equal(summary.late, 1);
    assert.equal(summary.unpaid, 1);
    assert.equal(summary.promisedAmount, 3500);
    assert.equal(summary.paidAmount, 3000);

    assert.equal(
        summary.items.find((item) => item.id === "p1")?.status,
        "ON_TIME"
    );
    assert.equal(
        summary.items.find((item) => item.id === "p2")?.status,
        "LATE"
    );
    assert.equal(
        summary.items.find((item) => item.id === "p3")?.status,
        "UNPAID"
    );
});

test("un pago no cumple dos promesas del mismo cliente", () => {
    const summary = classifyPromises(
        [
            {
                id: "p1",
                contactId: "c1",
                type: ContactOutcomeType.PROMISE,
                amount: 1000,
                dueAt: day("2026-10-10"),
                createdAt: day("2026-10-01")
            },
            {
                id: "p2",
                contactId: "c1",
                type: ContactOutcomeType.PROMISE,
                amount: 1000,
                dueAt: day("2026-10-20"),
                createdAt: day("2026-10-11")
            }
        ],
        [
            {
                contactId: "c1",
                amount: 1000,
                paidAt: day("2026-10-10"),
                createdAt: day("2026-10-10")
            }
        ]
    );

    assert.equal(summary.onTime, 1);
    assert.equal(summary.unpaid, 1);
});

test("un pago anterior a la promesa no la da por cumplida", () => {
    const summary = classifyPromises(
        [
            {
                id: "p1",
                contactId: "c1",
                type: ContactOutcomeType.PROMISE,
                amount: 1000,
                dueAt: day("2026-10-20"),
                createdAt: day("2026-10-15")
            }
        ],
        [
            {
                contactId: "c1",
                amount: 1000,
                paidAt: day("2026-10-01"),
                createdAt: day("2026-10-01")
            }
        ]
    );

    assert.equal(summary.unpaid, 1);
    assert.equal(summary.paidAmount, 0);
});

test("sin promesas el resumen queda en cero", () => {
    const summary = classifyPromises([], []);

    assert.deepEqual(
        {
            onTime: summary.onTime,
            late: summary.late,
            unpaid: summary.unpaid,
            items: summary.items.length
        },
        { onTime: 0, late: 0, unpaid: 0, items: 0 }
    );
});
