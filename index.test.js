let { expression } = require('./index');

console.log(expression('post.title starts with "hello"'));
console.log(expression('post.title matches /hello/g | uppercase'));
console.log(expression('str in array'));