four51.app.directive('mtFeaturedCarousel', ['$interval', '$timeout', function($interval, $timeout) {
    var AUTO_PLAY_MS = 2500;
    var SCROLL_DURATION_MS = 250;

    return {
        restrict: 'A',
        link: function(scope, element) {
            var viewport = element[0];
            var timer;
            var animFrame;

            function cardWidth() {
                var card = viewport.querySelector('.mt-carousel-card');
                return card ? card.offsetWidth : 0;
            }

            function atEnd() {
                return viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
            }

            function atStart() {
                return viewport.scrollLeft <= 0;
            }

            // Fast, fixed-duration scroll instead of the browser's native smooth-scroll, whose
            // actual speed/duration isn't controllable and varies noticeably by browser.
            function animateScrollTo(target) {
                if (animFrame) cancelAnimationFrame(animFrame);
                var start = viewport.scrollLeft;
                var change = target - start;
                var startTime = null;

                function step(timestamp) {
                    if (!startTime) startTime = timestamp;
                    var elapsed = timestamp - startTime;
                    var progress = Math.min(elapsed / SCROLL_DURATION_MS, 1);
                    // ease-out
                    var eased = 1 - Math.pow(1 - progress, 2);
                    viewport.scrollLeft = start + change * eased;
                    if (progress < 1) {
                        animFrame = requestAnimationFrame(step);
                    } else {
                        animFrame = null;
                    }
                }
                animFrame = requestAnimationFrame(step);
            }

            scope.featuredNext = function() {
                if (atEnd()) {
                    animateScrollTo(0);
                    return;
                }
                var width = cardWidth();
                if (width) animateScrollTo(viewport.scrollLeft + width);
            };

            scope.featuredPrev = function() {
                if (atStart()) {
                    animateScrollTo(viewport.scrollWidth);
                    return;
                }
                var width = cardWidth();
                if (width) animateScrollTo(viewport.scrollLeft - width);
            };

            function stopAutoPlay() {
                if (timer) {
                    $interval.cancel(timer);
                    timer = null;
                }
            }

            function startAutoPlay() {
                stopAutoPlay();
                if (viewport.scrollWidth <= viewport.clientWidth + 1) return; // everything already fits, nothing to scroll
                timer = $interval(scope.featuredNext, AUTO_PLAY_MS);
            }

            // Wait a tick after the product list renders so scrollWidth reflects the real card count.
            scope.$watch('featuredProducts.length', function(len) {
                if (len) $timeout(startAutoPlay);
            });

            element.on('mouseenter', stopAutoPlay);
            element.on('mouseleave', startAutoPlay);

            scope.$on('$destroy', function() {
                stopAutoPlay();
                if (animFrame) cancelAnimationFrame(animFrame);
            });
        }
    };
}]);
