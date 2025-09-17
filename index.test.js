import { parseExpression } from './index.js';
import assert from 'node:assert';
import test from 'node:test';

test('operator: in', t => {
	assert.equal(
		parseExpression('str in array'),
		'this.array.includes(this.str)'
	);
});

test('operator: matches', t => {
	assert.equal(
		parseExpression('str matches /hello world/'),
		'!!"".match.call(this.str, /hello world/)'
	);
});

test('operator: starts with', t => {
	assert.equal(
		parseExpression('str starts with "hello"'),
		'"".startsWith.call(this.str, "hello")'
	);
});

test('operator: ends with', t => {
	assert.equal(
		parseExpression('str ends with "hello"'),
		'"".endsWith.call(this.str, "hello")'
	);
});

test('operator: range', t => {
	assert.equal(parseExpression('1..5'), 'this.__filters__.range(1, 5)');
	assert.equal(parseExpression('1..a'), 'this.__filters__.range(1, this.a)');
	assert.equal(parseExpression('"a".."z"'), 'this.__filters__.range("a", "z")');
	assert.equal(
		parseExpression('"a".."z" | each(uppercase)'), 
		'this.__filters__.each(this.uppercase, this.__filters__.range("a", "z"))'
	);
});

test('operator: truncate', t => {
	assert.equal(parseExpression('a // 5'), 'Math.trunc(this.a / 5)');
});

test('operator: filter', t => {
	assert.equal(
		parseExpression('posts[posts.length - 1] | escape'), 
		'this.__filters__.escape(this.posts[this.posts.length - 1])'
	);
});

test('operator: filter (async)', t => {
	assert.equal(
		parseExpression('posts[posts.length - 1] | escape', { async: true }), 
		'await this.__filters__.escape(this.posts[this.posts.length - 1])'
	);

	assert.equal(
		parseExpression('posts | batch(3) | tostring', { async: true }), 
		'await this.__filters__.tostring(await this.__filters__.batch(3, this.posts))'
	);
});

test('string context', () => {
	assert.equal(
		parseExpression('"posts| escape"'),
		'"posts| escape"'
	);

	assert.equal(
		parseExpression("'\\'2 // 3 | isOdd'"),
		"'\\'2 // 3 | isOdd'"
	);

	assert.equal(
		parseExpression("posts[`Therefore..I dunno ${post|inverse}`] | length"),
		"this.__filters__.length(this.posts[`Therefore..I dunno ${this.__filters__.inverse(this.post)}`])"
	);

	assert.equal(
		parseExpression("posts[html`Therefore..I dunno ${post|inverse}`] | length"),
		"this.__filters__.length(this.posts[this.html`Therefore..I dunno ${this.__filters__.inverse(this.post)}`])"
	);
});

test('simple expressions', t => {
	assert.equal(
		parseExpression('true'),
		'true'
	);

	assert.equal(
		parseExpression('false'),
		'false'
	);


	assert.equal(
		parseExpression('1'),
		'1'
	);

	assert.equal(
		parseExpression('"str"'),
		'"str"'
	);

	assert.equal(
		parseExpression('[]', { async: true }),
		'[]'
	);

	assert.equal(
		parseExpression('{}', { async: true }),
		'{}'
	);

	assert.equal(
		parseExpression('this', { async: true }),
		'this'
	);
});