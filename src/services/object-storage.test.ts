import assert from "node:assert/strict";
import test from "node:test";

import { signRequest } from "./object-storage.service";

/**
 * Vector oficial de AWS para SigV4 con S3 (GET de un objeto con `Range`).
 * Si la firma coincide, el algoritmo está bien.
 */
test("la firma SigV4 coincide con el ejemplo de AWS", () => {
    const authorization = signRequest({
        method: "GET",
        host: "examplebucket.s3.amazonaws.com",
        path: "/test.txt",
        payloadHash:
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        amzDate: "20130524T000000Z",
        headers: {
            host: "examplebucket.s3.amazonaws.com",
            range: "bytes=0-9",
            "x-amz-content-sha256":
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "x-amz-date": "20130524T000000Z"
        },
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "us-east-1",
        service: "s3"
    });

    assert.match(
        authorization,
        /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/
    );
});
