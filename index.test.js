let { expression } = require('./index');
let tape = require('tape');

tape('operator: in', t => {
	t.equal(
		expression('str in array'),
		'this.array.includes(this.str)'
	);
	t.end();
});

tape('operator: matches', t => {
	t.equal(
		expression('str matches /hello world/'),
		'!!"".match.call(this.str, /hello world/)'
	);
	t.end();
});

tape('operator: starts with', t => {
	t.equal(
		expression('str starts with "hello"'),
		'"".startsWith.call(this.str, "hello")'
	);
	t.end();
});

tape('operator: ends with', t => {
	t.equal(
		expression('str ends with "hello"'),
		'"".endsWith.call(this.str, "hello")'
	);
	t.end();
});

tape('operator: range', t => {
	t.equal(expression('1..5'), 'this.__filters__.range(1, 5)');
	t.equal(expression('1..a'), 'this.__filters__.range(1, this.a)');
	t.equal(expression('"a".."z"'), 'this.__filters__.range("a", "z")');
	t.equal(
		expression('"a".."z" | each(uppercase)'), 
		'this.__filters__.each(this.uppercase, this.__filters__.range("a", "z"))'
	);
	t.end();
});

tape('operator: truncate', t => {
	t.equal(expression('a // 5'), 'Math.trunc(this.a / 5)');
	t.end();
});

tape('operator: filter', t => {
	t.equal(
		expression('posts[posts.length - 1] | escape'), 
		'this.__filters__.escape(this.posts[this.posts.length - 1])'
	);
	t.end();
});

tape('operator: filter (async)', t => {
	t.equal(
		expression('posts[posts.length - 1] | escape', { async: true }), 
		'await this.__filters__.escape(this.posts[this.posts.length - 1])'
	);

	t.equal(
		expression('posts | batch(3) | tostring', { async: true }), 
		'await this.__filters__.tostring(await this.__filters__.batch(3, this.posts))'
	);
	t.end();
});