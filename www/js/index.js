var gpxr = angular.module("gpxr", ["ngCordovaBluetoothLE"]);

gpxr.config(['$qProvider', function ($qProvider) {
    $qProvider.errorOnUnhandledRejections(false);
}]);

gpxr.controller("main", [ '$scope', '$rootScope', function($scope, $rootScope) {
    $scope.loading = true;
    $scope.errorText = '';
    $scope.showError = false;
    $rootScope.currentGeo = false;
    $rootScope.currentHeading = false;
  
    document.addEventListener("deviceready", function(){
        $scope.loading = false;

        navigator.geolocation.watchPosition(function(geo){
          $rootScope.currentGeo = geo; //'Timestamp', 'Speed', 'Heading', 'Altitude Accuracy', 'Latitude', 'Longitude', 'Altitude', 'Accuracy'
        }, function(error){
          $rootScope.error(error)
        }, { enableHighAccuracy: true });

        navigator.compass.watchHeading(function(compass){
         //magneticHeading trueHeading headingAccuracy timestamp
          $rootScope.currentHeading = compass;
        }, function(error){
          $rootScope.error(error)
        });

        $scope.$apply();
    }, false);
    $scope.selectedPage = 'bluetooth';

    $scope.error = function(t){$rootScope.error(t);}

    $rootScope.error = function(errorText){
        $scope.$apply(function(){
          $scope.errorText = errorText;
                  $scope.showError = true;
        });
    }

    $scope.changePage = function(page){
         $scope.selectedPage = page;
    }
}]);

gpxr.controller("bluetooth", [ '$scope', '$cordovaBluetoothLE', '$timeout', '$interval', '$rootScope', function($scope, $cordovaBluetoothLE, $timeout, $interval, $rootScope) {
    $scope.error = function(t){$rootScope.error(t);}
    $scope.foundDevices = {};
    $scope.selectDevice = false;
    $scope.selectedFile = false;
    $scope.connectionDevice = false;
    $scope.connectionStatus = false;
    $scope.lastSerialSendTimestamp = 0;

    $scope.error = function(text){$scope.$parent.error(text);}
    $scope.input = '';

    $scope.chooseFile = function(){
      fileChooser.open(function(file) {
        $scope.selectedFile = file; //uri name mime_type extension
      });
    }

    $interval(function(){
      bluetoothSerial.isEnabled(
          function() {
              var keys = Object.keys($scope.foundDevices);
              if(keys.length == 0){
                  bluetoothSerial.list(function(list){
                    if(list.length > 0){
                      $scope.foundDevices = list;
                      $scope.$apply();
                    }
                    else {
                      $scope.error('Не найдено ни одного подключенного устройства.');
                    }
                  });
                }

                if($scope.selectDevice.address){
                  bluetoothSerial.isConnected(
                      function() {
                          $scope.connectionDevice = true;
                      },
                      function() {
                          $scope.connected($scope.selectDevice.address);
                      }
                  );
                }
          },
          function() {
              bluetoothSerial.enable();
              $scope.error('Необходимо включить bluetooth.');
          } );
    }, 1000);

    $rootScope.sendToSerial = function(text){
      var nowTimestamp = new Date().getTime();

      if(!$scope.lastSerialSendTimestamp || $scope.lastSerialSendTimestamp < (nowTimestamp - 1000)){
        bluetoothSerial.write(text);
        $scope.lastSerialSendTimestamp = nowTimestamp;
        console.log('send '+text);
      }
      else {
        console.log('delay 1 sec send to serial', nowTimestamp, $scope.lastSerialSendTimestamp);
      }
    }

    $scope.connected = function(address){
      $scope.connectionStatus = true;
      bluetoothSerial.connect(address, function(obj){
        $scope.connectionStatus = false;
        $scope.connectionDevice = true;
        $scope.$apply();
//
//        bluetoothSerial.read(function (data) {
//            console.log(data);
//        }, failure);
      }, function(obj){
        $scope.connectionStatus = false;
        $scope.connectionDevice = false;
        $scope.error(obj);
        $scope.$apply();
      });
    }
}]);

gpxr.directive("leafletMap", leafletMap);
leafletMap.$inject = ['$rootScope', '$interval'];
function leafletMap($rootScope, $interval) {
  return {
    restrict: 'E',
    replace: true,
    scope: {
      fileData: '='
    },
    templateUrl: 'templates/map.html',
    controller: function ($scope, $element, $attrs, $rootScope, $interval, $rootScope) {
      $scope.map = false;
      $scope.gpxLayer = false;
      $scope.gpxDistanceTraveledLayer = false;
      $scope.currentPositionMarker = false;
      //Массив координат пути
      $scope.coordinatesCurrentRoute = false;
      //Расстояние до ближайшей точки
      $scope.distanceToNearestPoint = false;
      //Направление ближайшей точки
      $scope.directionToNearestPoint = false;
      //type 1,2,3  distance, angle
      $scope.nextTurnData = false;
      //IntervalId для остановки цикла навигации
      $scope.navigationCycleId = false;

      //Остановка навигации
      $scope.stopNavigation = function(){
        if($scope.navigationCycleId){
          $interval.cancel($scope.navigationCycleId);
          $scope.navigationCycleId = false;

          if($scope.coordinatesCurrentRoute){
            for(var inc in $scope.coordinatesCurrentRoute){
              $scope.coordinatesCurrentRoute[inc].passed = false;
            }
          }
        }
      }

      //Получить разницу двух направлений
      $scope.getAngleDifference = function (firstAngle, secondAngle, getSide) {
        var difference = false;
        var side = false;
        firstAngle 


        if(secondAngle > firstAngle){
          if((secondAngle - firstAngle) > 180) {
            difference = (360 - secondAngle) + firstAngle;
            side = 1;
          }
          else {
            difference = secondAngle - firstAngle;
            side = 2;
          }
        }
        else {
          var differenceAngle = firstAngle - secondAngle;

          if(getSide){
            differenceAngle -= 360;
          }

          if(differenceAngle > 180) {
            difference = (360 - firstAngle) + secondAngle;
            side = 1;
          }
          else {
            difference = firstAngle - secondAngle;
            side = 2;
          }
        }

        return getSide?side:difference;
      }

      //Получить расстояние до ближайшего поворота
      $scope.getDistanceToNextTurn = function (distanceToNextPoint, nextPointId) {
        result = false;

        if(distanceToNextPoint !== false && nextPointId !== false && $scope.coordinatesCurrentRoute){
          var distance = distanceToNextPoint;

          if($scope.coordinatesCurrentRoute[nextPointId].turn && $scope.coordinatesCurrentRoute[nextPointId].turn.type != 0){
            result = $scope.coordinatesCurrentRoute[nextPointId].turn;
            result.distance = distance;

            return result;
          }

          for(nextPointId; nextPointId < $scope.coordinatesCurrentRoute.length; ++nextPointId){
            if($scope.coordinatesCurrentRoute[nextPointId+1]){
              distance += $scope.getDistance($scope.coordinatesCurrentRoute[nextPointId], $scope.coordinatesCurrentRoute[nextPointId+1]);
              if($scope.coordinatesCurrentRoute[nextPointId+1].turn && $scope.coordinatesCurrentRoute[nextPointId+1].turn.type != 0){
                result = $scope.coordinatesCurrentRoute[nextPointId+1].turn;
                result.distance = distance;
                
                return result;
              }
            }
          }
        }
        
        return result;
      }

      //Начать навигацию (запустить навигационный цикл)
      $scope.startNavigation = function(){
        var minimumDistanceId = false;
        var nextPointDistance = false;

// создать событие смены minimumDistanceId, при след цикле если minimumDistanceId не менялось расстояние к ней увеличилось а к след уменьшилось помечать minimumDistanceId как пройденую, и брать след
        $scope.navigationCycleId = $interval(function(){
          if($rootScope.currentGeo && $rootScope.currentHeading && $scope.coordinatesCurrentRoute){


             var currentLatLng = {lat:$rootScope.currentGeo.coords.latitude, lng:$rootScope.currentGeo.coords.longitude};

            var isChangeMinimumDistanceId = false;
            var oldDistanceToNearestPoint = $scope.distanceToNearestPoint?$scope.distanceToNearestPoint:false; //Прошлое расстояние от текущего местоположения до isChangeMinimumDistanceId
            var oldNextPointDistance = nextPointDistance?nextPointDistance:false; //Прошлое расстояние от текущего местоположения до след. точки isChangeMinimumDistanceId+1

            for(var i in $scope.coordinatesCurrentRoute){
              if(minimumDistanceId === false){
                minimumDistanceId = i;
              }

              if(!$scope.coordinatesCurrentRoute[i].passed && $scope.getDistance(currentLatLng, $scope.coordinatesCurrentRoute[i]) <= $scope.getDistance(currentLatLng, $scope.coordinatesCurrentRoute[minimumDistanceId])){
                minimumDistanceId = i;
                isChangeMinimumDistanceId = true;
                console.log('currentId', minimumDistanceId);
              }
            }


            if($scope.coordinatesCurrentRoute[parseInt(minimumDistanceId)+1]){
              nextPointDistance = $scope.getDistance(currentLatLng, $scope.coordinatesCurrentRoute[parseInt(minimumDistanceId)+1]);
              $scope.distanceToNearestPoint = $scope.getDistance(currentLatLng, $scope.coordinatesCurrentRoute[minimumDistanceId]);

              if(!isChangeMinimumDistanceId && nextPointDistance < oldNextPointDistance && $scope.distanceToNearestPoint > oldDistanceToNearestPoint){ //Преодолели текущую точку
                minimumDistanceId = parseInt(minimumDistanceId)+1;
                $scope.distanceToNearestPoint = $scope.getDistance(currentLatLng, $scope.coordinatesCurrentRoute[minimumDistanceId]); //Пересчитываем расстояние
              }

              //Получить данные след поворота
              $scope.nextTurnData = $scope.getDistanceToNextTurn($scope.distanceToNearestPoint, parseInt(minimumDistanceId));
              //Получить направление на след точку
              $scope.directionToNearestPoint = $scope.getPointDirection($scope.coordinatesCurrentRoute[minimumDistanceId]);

              $rootScope.sendToSerial('$'+$scope.nextTurnData.distance+'#'+$scope.nextTurnData.type+'@'+$scope.nextTurnData.side+'!'+$scope.directionToNearestPoint+'&');

              //Отрисовать маршрут на карте
              $scope.paintOverDistanceTraveled($scope.coordinatesCurrentRoute[minimumDistanceId]);
              //Пометить уже пройденые точки
              for(var inc in $scope.coordinatesCurrentRoute){ 
                if(parseInt(minimumDistanceId) >= parseInt(inc)){
                  $scope.coordinatesCurrentRoute[inc].passed = true;
                }
              }
            }
            else {
              alert('Цель достигнута');
              //Цель достигнута
            }

  
          }
        }, 200);
      }

      //Получить направление к точке отсносительно текущего направления 
      $scope.getPointDirection = function(coordinatePoint){
        var result = false;

        if($rootScope.currentGeo && $rootScope.currentHeading){
          var myPoint = {lat:$rootScope.currentGeo.coords.latitude, lng:$rootScope.currentGeo.coords.longitude};
          result = (360 - Math.round($rootScope.currentHeading.trueHeading) + $scope.getAzimut(myPoint, coordinatePoint)) % 360;
        }

        return result;
      }

       //Отобразить маршрут на карте
       $scope.paintOverDistanceTraveled = function(LatLng){
          if($scope.coordinatesCurrentRoute && $scope.map){
            var i = 0;
            for(i in $scope.coordinatesCurrentRoute){
              if($scope.coordinatesCurrentRoute[i].lat == LatLng.lat && $scope.coordinatesCurrentRoute[i].lng == LatLng.lng){
                break;
              }
            }

            if($scope.gpxDistanceTraveledLayer){
              $scope.map.removeLayer($scope.gpxDistanceTraveledLayer);
            }

            if($scope.gpxLayer){
              $scope.map.removeLayer($scope.gpxLayer);
            }

            $scope.gpxLayer = L.polyline($scope.coordinatesCurrentRoute.slice(i), {
              color: 'red',
              opacity: 1,
              weight: 2,
              lineCap: 'round'
            });

            $scope.gpxDistanceTraveledLayer = L.polyline($scope.coordinatesCurrentRoute.slice(0, i+1), {
               color: 'green',
               opacity: 1,
               weight: 2,
               zIndexOffset: 10,
               lineCap: 'round'
             });

            $scope.gpxDistanceTraveledLayer.addTo($scope.map);
            $scope.gpxLayer.addTo($scope.map);
          }
      }

      //Найти точки поворотов
      $scope.findTurnPoints = function(route) {
        for(var i in route){
          var a = route[i];

          if(route[parseInt(i)+1]){
            var b = route[parseInt(i)+1];
          }

          if(route[parseInt(i)+2]){
            var c = route[parseInt(i)+2];
          }

          if(a && b && c){
            var firstAuzimut = $scope.getAzimut(a, b);
            var secundAzimut = $scope.getAzimut(b, c);
            var angleDifference = $scope.getAngleDifference(firstAuzimut, secundAzimut);
            var type = false;

            if(angleDifference >= 35 && angleDifference < 75){
              type = 1;
            }
            else if(angleDifference >= 75 && angleDifference < 120){
              type = 2;
            }
            else if(angleDifference > 120){
               type = 3;
            }
            else {
               type = 0;
            }

            if(route[parseInt(i)+1]){
              route[parseInt(i)+1].turn = {type:type, angle:angleDifference, side: $scope.getAngleDifference(firstAuzimut, secundAzimut, true)}
            }
          }
        }

        return route;
      }

      $scope.clearDuplicates = function (route) {
        for(var i = 0; i < route.length; ++i){
          if(route[i+1] && $scope.compareCordinates(route[parseInt(i)], route[parseInt(i)+1])){
            route.splice(i , 1);
            --i;
          }
        }

        return route;
      }

      //Загрузить карту
      $scope.reloadMap = function(){
        $scope.coordinatesCurrentRoute = false;
        if(!$scope.fileData){
          $rootScope.error('Сначала необходимо выбрать файл.');
        }
        else {
          if(!$scope.map){
            $scope.map = new L.map('map');
          }

          if($scope.gpxLayer){
            $scope.map.removeLayer($scope.gpxLayer);
          }

          //Добавление тайлов карт
          var tileLayer = new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
          $scope.map.addLayer(tileLayer);
          //Парсин gpx файла и создание слоя с маршрутом
          new L.GPX($scope.fileData.uri, {
              async: true
           }).on('loaded', function(e) {
              e.target.eachLayer(function(l){
                l.eachLayer(function(layer){
                  if(layer.getLatLngs){
                    var latLngs = layer.getLatLngs();
                    //Достаем координаты самого длинного маршрута в gpx файле
                    if(!$scope.coordinatesCurrentRoute || latLngs.length > $scope.coordinatesCurrentRoute.length){
                      $scope.coordinatesCurrentRoute = $scope.clearDuplicates(latLngs);
                      $scope.coordinatesCurrentRoute = $scope.findTurnPoints($scope.coordinatesCurrentRoute);
                    }
                  }
                })
              })

              if($scope.coordinatesCurrentRoute){
                  $scope.gpxLayer = L.polyline($scope.coordinatesCurrentRoute, {
                    color: 'red',
                    opacity: 1,
                    weight: 2,
                    lineCap: 'round'
                  });
                 //Добавление gpx слоя на карту
                 $scope.gpxLayer.addTo($scope.map);
                 $scope.map.fitBounds($scope.gpxLayer.getBounds()); //Установить края карты
              }
           });

          //Отображение маркера текущей позиции
          $rootScope.$watch('currentGeo', function(newValue, oldValue){
            if($scope.map && $scope.gpxLayer){
              if($scope.currentPositionMarker){
                $scope.map.removeLayer($scope.currentPositionMarker);
              }

              var rotate = $rootScope.currentHeading&&$rootScope.currentHeading.trueHeading?Math.round($rootScope.currentHeading.trueHeading):0;
              var myIcon = L.divIcon({className: 'current-position-marker', html:'<div style="transform: rotate('+rotate+'deg);" class="direction"></div>'});

              $scope.currentPositionMarker = L.marker([newValue.coords.latitude, newValue.coords.longitude], {icon: myIcon}).addTo($scope.map);
            }
          });
        }
      }

      //Сравнить координаты
      $scope.compareCordinates = function(firstCord, secondCord) {
        return firstCord && secondCord && firstCord.lat == secondCord.lat && firstCord.lng == secondCord.lng;
      }

      //Получить расстояние между двумя точками
      $scope.getDistance = function(fromPoint, toPoint){
        var cl1 = Math.cos(fromPoint.lat*Math.PI/180)
        var cl2 = Math.cos(toPoint.lat*Math.PI/180)
        var sl1 = Math.sin(fromPoint.lat*Math.PI/180)
        var sl2 = Math.sin(toPoint.lat*Math.PI/180)
        var delta = toPoint.lng*Math.PI/180 - fromPoint.lng*Math.PI/180
        var cdelta = Math.cos(delta)
        var sdelta = Math.sin(delta)

        var y = Math.sqrt(Math.pow(cl2*sdelta,2)+Math.pow(cl1*sl2-sl1*cl2*cdelta,2))
        var x = sl1*sl2+cl1*cl2*cdelta
        var ad = Math.atan2(y,x);

        return Math.round(ad*6372795) //радиус сферы земли
      }

      //Получить направление вектора по двум координатам 
      $scope.getAzimut = function(fromPoint, toPoint){
         var cl2 = Math.cos(toPoint.lat*Math.PI/180);
         var sl2 = Math.sin(toPoint.lat*Math.PI/180);
         var delta = toPoint.lng*Math.PI/180 - fromPoint.lng*Math.PI/180;

         var x = (Math.cos(fromPoint.lat*Math.PI/180)*sl2) - (Math.sin(fromPoint.lat*Math.PI/180)*cl2*Math.cos(delta));
         var z = Math.atan(-(Math.sin(delta)*cl2)/x) * (180/Math.PI);
         z = x < 0?z+180:z;
         var z2 = (z+180) % 360 - 180;
         z2 = - (z2 * (Math.PI/180));
         var anglerad2 = z2 - ((2*Math.PI)*Math.floor((z2/(2*Math.PI))) );

         return Math.round((anglerad2*180.)/Math.PI);
        }
    }
  }
}

