// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { FileIndex, Index, Reference, Section } from '../../src/index/index';
import { parseHcl } from '../../src/index/hcl-hil';
import { build } from '../../src/index/build';

const template =
    `
resource "aws_s3_bucket" "bucket" {}
variable "region" {}
data "template_file" "template" {}
`;

suite("Index Tests", () => {
    suite("Reference Tests", () => {
        const [ast, error] = parseHcl(template);
        const index = build(null, ast);

        test("Handles variable references", () => {
            let r = new Reference("var.region", null, null);
            assert.equal(r.type, "variable");
            assert.equal(r.targetId, "var.region");

            let s = [...index.query(r.getQuery())];
            assert.equal(s.length, 1);
            assert.equal(s[0].name, "region");
        });

        test("Handles data references", () => {
            let r = new Reference("data.template_file.template.rendered", null, null);
            assert.equal(r.type, "data");
            assert.equal(r.targetId, "data.template_file.template");

            let s = [...index.query(r.getQuery())];
            assert.equal(s.length, 1);
            assert.equal(s[0].name, "template");
        });

        test("Handles resource references", () => {
            let r = new Reference("aws_s3_bucket.bucket.arn", null, null);
            assert.equal(r.type, "aws_s3_bucket");
            assert.equal(r.targetId, "aws_s3_bucket.bucket");

            let s = [...index.query(r.getQuery())];
            assert.equal(s.length, 1);
            assert.equal(s[0].name, "bucket");
        });

        test("Returns correct valuePath for resources", () => {
            let r = new Reference("aws_s3_bucket.bucket.arn", null, null);
            assert.deepEqual(r.valuePath(), ["arn"]);
        });

        test("Returns correct valuePath for data", () => {
            let r = new Reference("data.template_file.template.rendered", null, null);
            assert.deepEqual(r.valuePath(), ["rendered"]);
        });
    });

    suite("Section tests", () => {
        test("variable ID", () => {
            let variable = new Section("variable", null, null, "region", null, null, null);

            assert.equal(variable.id(), "var.region");
        });

        test("resource ID", () => {
            let resource = new Section("resource", "aws_s3_bucket", null, "bucket", null, null, null);

            assert.equal(resource.id(), "aws_s3_bucket.bucket");
        });

        test("data ID", () => {
            let data = new Section("data", "template_file", null, "template", null, null, null);

            assert.equal(data.id(), "data.template_file.template");
        });

        test("output ID", () => {
            let output = new Section("output", null, null, "template", null, null, null);

            assert.equal(output.id(), "template");
        });

        test("accepts new name when returning id", () => {
            let variable = new Section("variable", null, null, "region", null, null, null);

            assert.equal(variable.id("newName"), "var.newName");
        });
    });

    suite("FileIndex Tests", () => {
        test("Returns all sections by default", () => {
            let [ast, error] = parseHcl(template);
            let index = build(null, ast);

            let all = [...index.query()];

            assert.equal(all.length, 3);
            assert.notEqual(all[0].name, all[1].name);
        });

        test("Returns only sections which match the name", () => {
            let [ast, error] = parseHcl(template);
            let index = build(null, ast);

            let r = [...index.query({ name: "uck" })];

            assert.equal(r.length, 1);
            assert.equal(r[0].name, "bucket");
        });

        test("Returns only sections which match the type", () => {
            let [ast, error] = parseHcl(template);
            let index = build(null, ast);

            let r = [...index.query({ section_type: "resource" })];

            assert.equal(r.length, 1);
            assert.equal(r[0].name, "bucket");
        });

        test("Returns only sections which match the type", () => {
            let [ast, error] = parseHcl(template);
            let index = build(null, ast);

            let r = [...index.query({ type: "aws_s3_bucket" })];

            assert.equal(r.length, 1);
            assert.equal(r[0].name, "bucket");
        });
    });

    suite("Index Tests", () => {
        let [astA, errorA] = parseHcl(`resource "aws_s3_bucket" "bucket" {}`);
        let [astB, errorB] = parseHcl(`variable "region" {}`);

        let a = build(vscode.Uri.parse("a.tf"), astA);
        let b = build(vscode.Uri.parse("b.tf"), astB);

        test("query can return results for ALL files", () => {
            let index = new Index(a, b);

            let results = index.query("ALL_FILES");

            assert.equal(results.length, 2);
        });

        test("query returns results for a single file", () => {
            let index = new Index(a, b);

            let results = index.query(vscode.Uri.parse("a.tf"));

            assert.equal(results.length, 1);
            assert.equal(results[0].name, "bucket");
        });

        test("clear clears", () => {
            let index = new Index(a, b);

            assert.notEqual(index.query("ALL_FILES").length, 0);

            // TODO: check callback aswell
            index.clear();

            assert.equal(index.query("ALL_FILES").length, 0);
        });

        test("does not index documents from excluded paths", async () => {
            let index = new Index;

            let base = vscode.workspace.workspaceFolders[0].uri;
            let doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(`${base.toString()}/template.tf`));

            assert.equal(index.indexDocument(doc, { exclude: ["*"] }), null, "should not index document when all paths are excluded");

            assert.notEqual(index.indexDocument(doc), null, "should index doc");
        });

        suite("References", () => {
            let [astC, errorC] = parseHcl(`resource "aws_s3_bucket" "bucket2" { name = "\${var.region}" }`);
            let [astD, errorD] = parseHcl(`resource "aws_s3_bucket" "bucket3" { name = "\${var.region}" }`);

            let c = build(vscode.Uri.parse("c.tf"), astC);
            let d = build(vscode.Uri.parse("d.tf"), astD);

            test("getReferences returns results for all files", () => {
                let index = new Index(a, b, c, d);

                let references = index.queryReferences("ALL_FILES", { target: "var.region" });

                assert.equal(references.length, 2);
            });

            test("getReferences returns results for a single file", () => {
                let index = new Index(a, b, c, d);

                let references = index.queryReferences(d.uri, { target: "var.region" });

                assert.equal(references.length, 1);
            });

            test("getReferences supports section as a target instead of string", () => {
                let index = new Index(a, b, c, d);

                let references = index.queryReferences("ALL_FILES", { target: b.sections[0] });
                assert.equal(references.length, 2);
            });
        });
    });
});