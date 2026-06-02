//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

import * as assert from 'assert';

import * as vscode from 'vscode';
import * as PU from '../src/extension';

// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", () => {
    const xclipNotFoundError = new Error('/bin/sh: 1: xclip: not found')
    const xclipEnoentError = new Error('spawn xclip ENOENT')

    test("Get title from undefined", () => {
        var paster = new PU.Paster()
        var URL = "https://google.com"
        var title = paster.processTitle(undefined, URL)
        assert.equal(title, URL) 
    })

    test("Get title normally", () => {
        var paster = new PU.Paster()
        var URL = "https://google.com"
        var title = "Google"
        var titleProcessed = paster.processTitle(title, URL)
        assert.equal(title, titleProcessed) 
    })

    test("Detect missing xclip errors", () => {
        var paster = new PU.Paster()
        assert.equal(paster.isMissingXclipError(xclipNotFoundError, 'linux'), true)
        assert.equal(paster.isMissingXclipError(xclipNotFoundError, 'darwin'), false)
    })

    test("Detect missing xclip ENOENT errors", () => {
        var paster = new PU.Paster()
        assert.equal(paster.isMissingXclipError(xclipEnoentError, 'linux'), true)
        assert.equal(paster.isMissingXclipError(xclipEnoentError, 'darwin'), false)
    })

    test("Ignore unrelated clipboard errors", () => {
        var paster = new PU.Paster()
        var detected = paster.isMissingXclipError(new Error('clipboard access denied'), 'linux')
        assert.equal(detected, false)
    })
});