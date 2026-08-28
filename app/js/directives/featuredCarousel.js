four51.app.directive('mtFeaturedCarousel', ['$interval', '$timeout', function($interval, $timeout) {
    var AUTO_PLAY_MS = 4000;

    return {
        restrict: 'A',
        link: function(scope, element) {
            var viewport = element[0];
            var timer;

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

            scope.featuredNext = function() {
                if (atEnd()) {
                    viewport.scrollTo({ left: 0, behavior: 'smooth' });
                    return;
                }
                var width = cardWidth();
                if (width) viewport.scrollBy({ left: width, behavior: 'smooth' });
            };

            scope.featuredPrev = function() {
                if (atStart()) {
                    viewport.scrollTo({ left: viewport.scrollWidth, behavior: 'smooth' });
                    return;
                }
                var width = cardWidth();
                if (width) viewport.scrollBy({ left: -width, behavior: 'smooth' });
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

            scope.$on('$destroy', stopAutoPlay);
        }
    };
}]);
