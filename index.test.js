import { parseExpression } from './index.js';
import assert from 'node:assert';
import test from 'node:test';

test('operator: in', t => {
	assert.equal(
		parseExpression('str in array'),
		'this.array.includes(this.str)'
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

test('literal context', () => {
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

	assert.equal(
		parseExpression("'you and me' | length"),
		"this.__filters__.length('you and me')"
	);

	assert.equal(
		parseExpression("/a|b/g"),
		"/a|b/g"
	);
});

test('operators', () => {
	assert.equal(
		parseExpression('a and b'),
		'this.a && this.b'
	);

	assert.equal(
		parseExpression('a or b'),
		'this.a || this.b'
	);

	assert.equal(
		parseExpression('a b-and b'),
		'this.a & this.b'
	);

	assert.equal(
		parseExpression('a b-or b'),
		'this.a | this.b'
	);

	assert.equal(
		parseExpression('a b-xor b'),
		'this.a ^ this.b'
	);

	assert.equal(
		parseExpression('a ?? b'),
		'this.a ?? this.b'
	);

	assert.equal(
		parseExpression('1..10'),
		'this.__filters__.range(1, 10)'
	);

	assert.equal(
		parseExpression('["post-"~ post.type, "po~st"]'),
		'["post-" + this.post.type, "po~st"]'
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