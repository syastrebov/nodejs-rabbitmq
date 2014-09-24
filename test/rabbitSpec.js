(function() {
    'use strict';

    require('jasmine-expect');

    var rabbit = require('../index');
    var fs     = require('fs');

    describe('RabbitMQ', function() {
        var done, conn;

        beforeEach(function() {
            done = false;
            conn = rabbit.create({}, 'test-queue', 'test-exchange', 'direct');

            conn.setVerbose(true);
            conn.start();
        });
        it('Создание объекта', function() {
            expect(conn).toBeObject();
            conn.on('ready', function(handler) {
                handler.close();
                done = true;
            });
            waitsFor(function() {
                return done;
            });
        });
        it('Закрытие соединения', function() {
            expect(conn).toBeObject();
            conn.on('ready', function(conn) {
                conn.close();
                done = true;
            });
            waitsFor(function() {
                return done;
            });
        });
        it('Отправка сообщения', function() {
            conn.on('ready', function(handler) {
                handler.publish('my message');
                conn.on('published.message', function(message) {
                    handler.close();
                    console.log('sent message:' + message);

                    done = true;
                });
            });

            waitsFor(function() {
                return done;
            });
        });
        it('Получение сообщения', function() {
            conn.on('ready', function(handler) {
                handler.deliver();
                conn.on('incoming.message', function(message) {
                    handler.close();

                    console.log('got message:' + message);
                    done = true;
                });
            });

            waitsFor(function() {
                return done;
            });
        });
    });
}());